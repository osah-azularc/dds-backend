import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { mysqlSequelize } from "../../connections/seqDB.js";
import AdminHistory from "../models/admin/adminHistoryModel.js";
import User from "../models/User.js";
import UserRoleMapping from "../models/userRoleMapping.js";
import sendsgMail from "../utilities/sendsgMail.js";
import {
  fetchAgencyUsersData,
  toUserModelKeys,
  buildAgencyUserWelcomeEmail,
} from "./adminAgencyUsersHelpers.js";

export const updateAgencyUserAction = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();

  try {
    const current_datetime = new Date();

    if (!req.userId) {
      await transaction.rollback();
      return res.status(403).json({ message: "Access denied", success: false });
    }

    const param = req.body;

    if (param.agency_platform_id && param.agency_platform_id.includes("All")) {
      const allIndex = param.agency_platform_id.indexOf("All");
      param.agency_platform_id.splice(allIndex, 1);
    }

    let statusUpdate = 1;
    if (param.updateFlage && param.updateFlage === "statusUpdate") {
      statusUpdate = 2;
      delete param.updateFlage;
    }

    const check_userData = { ...param };
    const agency_id = param.agency_id || "";
    delete param.agency_id;
    const agency_platform_id = param.agency_platform_id;
    delete param.agency_platform_id;
    const rawRoleType = (param.user_role_type || "").toLowerCase();
    const user_role_type = rawRoleType.startsWith("agency")
      ? "agency"
      : "public";
    delete param.user_role_type;
    delete param.user_type;

    if (param.user_id && param.user_id !== "") {
      const old_values = await User.findOne({
        where: { userId: param.user_id },
      });
      param.modified_by = req.userId;

      delete param.apmId;
      delete param.name;
      delete param.mapping_id;

      const user_id = param.user_id;
      delete param.user_id;

      if (statusUpdate !== 2 && check_userData.email) {
        // Same email may exist on another user_master row for a different
        // agency assignment — only block when that other row is already
        // mapped to one of the platforms being requested here.
        const otherUsersWithEmail = await User.findAll({
          where: { email: check_userData.email, userId: { [Op.ne]: user_id } },
        });
        const otherUserIds = otherUsersWithEmail.map((u) => u.userId);

        if (otherUserIds.length > 0 && Array.isArray(agency_platform_id)) {
          const conflictingMapping = await UserRoleMapping.findOne({
            where: {
              user_id: { [Op.in]: otherUserIds },
              agency_platform_id: { [Op.in]: agency_platform_id },
            },
          });

          if (conflictingMapping) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: "Email-id already exist to selected agency combination.",
            });
          }
        }
      }

      if (param.last_login && param.last_login == 1 && param.status == 1) {
        param.last_login = new Date().toISOString().split("T")[0];
      } else {
        delete param.last_login;
      }

      await User.update(toUserModelKeys(param), {
        where: { userId: user_id },
        transaction,
      });

      if (Array.isArray(agency_platform_id)) {
        await UserRoleMapping.destroy({ where: { user_id }, transaction });

        await UserRoleMapping.bulkCreate(
          agency_platform_id.map((platformId) => ({
            agency_id,
            user_id,
            agency_platform_id: platformId,
            user_role_type,
            created_by: req.userId,
            modified_by: req.userId,
          })),
          { transaction },
        );
      }

      await AdminHistory.create(
        {
          new_values: JSON.stringify(param),
          old_values: JSON.stringify(old_values),
          modified_by: req.userId,
          module_name: "agencyusers",
          action_name: "update",
          modified_date: current_datetime,
        },
        { transaction },
      );

      await transaction.commit();

      return res.status(200).json({
        success: true,
        msg: "userUpdated",
        message: "Agency User updated successfully",
      });
    } else {
      // The same email may legitimately appear on more than one user_master row
      // (one per agency assignment) — only block when this exact email is
      // already mapped to one of the platforms being requested here.
      const existingUsers = await User.findAll({
        where: { email: check_userData.email },
      });
      const existingUserIds = existingUsers.map((u) => u.userId);

      if (existingUserIds.length > 0) {
        const conflictingMapping = await UserRoleMapping.findOne({
          where: {
            user_id: { [Op.in]: existingUserIds },
            agency_platform_id: { [Op.in]: agency_platform_id },
          },
        });

        if (conflictingMapping) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: "Email-id already exist to selected agency combination.",
          });
        }
      }

      param.created_by = param.modified_by = req.userId;
      param.last_login = new Date().toISOString().split("T")[0];

      const defaultPasswordExpiration = new Date();
      defaultPasswordExpiration.setDate(
        defaultPasswordExpiration.getDate() + 90,
      );

      // Legacy PHP set this via a MySQL UUID() expression on insert — reproduced
      // here so account-setup links can identify the user without exposing user_id.
      const userUuid = uuidv4();

      const newUser = await User.create(
        {
          ...toUserModelKeys(param),
          passwordExpiration: defaultPasswordExpiration,
          userUuid,
        },
        { transaction },
      );
      const user_id = newUser.userId;

      await UserRoleMapping.destroy({ where: { user_id }, transaction });

      await UserRoleMapping.bulkCreate(
        agency_platform_id.map((platformId) => ({
          agency_id,
          user_id,
          agency_platform_id: platformId,
          user_role_type,
          created_by: user_id,
          modified_by: user_id,
        })),
        { transaction },
      );

      const historyParam = { ...param };
      delete historyParam.password;

      await AdminHistory.create(
        {
          new_values: JSON.stringify(historyParam),
          modified_by: req.userId,
          module_name: "agencyusers",
          action_name: "add",
          modified_date: current_datetime,
        },
        { transaction },
      );

      await transaction.commit();

      const receiverName =
        param.firstname || param.lastname
          ? `${param.firstname || ""} ${param.lastname || ""}`.trim()
          : "Agency User";
      const receiverEmail = param.email;

      if (receiverEmail) {
        try {
          const { subject, html } = buildAgencyUserWelcomeEmail({
            receiverName,
            userUuid,
          });

          await sendsgMail(receiverEmail, subject, html);
        } catch (emailError) {
          // Account creation already committed — a failed welcome email should
          // not fail the request, matching the legacy PHP's fire-and-forget send.
          console.error(
            `[AgencyUser] Failed to send welcome email to ${receiverEmail}:`,
            emailError.message,
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: "Agency User added successfully",
      });
    }
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAgencyUsersAction = async (req, res) => {
  try {
    const search = (req.query?.search || "").trim();
    const agencyPlatformId = req.query?.agencyPlatformId || null;
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const pageSize = parseInt(req.query?.limit, 10) || 10;
    const { sortBy, sortOrder } = req.query;

    const { rows, total } = await fetchAgencyUsersData({
      search,
      agencyPlatformId,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    return res.status(200).json({
      success: true,
      agencyUserData: rows,
      pagination: {
        total,
        page,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
