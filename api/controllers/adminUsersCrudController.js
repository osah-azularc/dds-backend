import { Op } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import JudgeAssistantClerk from "../models/JudgeAssistantClerk.js";
import AdminHistory from "../models/admin/adminHistoryModel.js";
import AgencyPlatform from "../models/admin/agencyPlatformModel.js";
import { logger } from "../../config/winstonLogger.js";

/*
  Name: Admin User Controller
  Date Created: Current Date
  Description: Admin Settings, Users: Add/Edit user functionality
*/

const toModelKeys = (data) => {
  const mapped = {};
  const keyMap = {
    FirstName: "firstName",
    LastName: "lastName",
    MiddleInitial: "middleInitial",
    title: "title",
    initials: "initials",
    phone: "phone",
    Fax: "fax",
    email: "email",
    user_type: "userType",
    sub_type_role: "subTypeRole",
    is_active: "isActive",
    is_admin: "isAdmin",
    review_form1s: "reviewForm1s",
    modified_date: "modifiedDate",
    modified_by: "modifiedBy",
    created_date: "createdDate",
    created_by: "createdBy",
    access_token: "accessToken",
    notification_on_off: "notificationOnOff",
    user_uuid: "userUuid",
    is_active_billing: "isActiveBilling",
    is_administrative_personnel: "isAdministrativePersonnel",
  };
  for (const [raw, attr] of Object.entries(keyMap)) {
    if (data[raw] !== undefined) mapped[attr] = data[raw];
  }
  if (mapped.phone) mapped.phone = mapped.phone.replace(/\D/g, "");
  if (mapped.fax) mapped.fax = mapped.fax.replace(/\D/g, "");
  return mapped;
};

export const usersAddEdit = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();

  try {
    const current_datetime = new Date();

    if (!req.userId) {
      await transaction.rollback();
      return res.status(403).json({
        message: "Access denied",
        success: false,
      });
    }

    const param = req.body;

    if (param.data && param.data.judge_assistant_clerk_concat) {
      delete param.data.judge_assistant_clerk_concat;
    }

    if (
      param.data &&
      param.data.user_type === "sa" &&
      !param.data.sub_type_role
    ) {
      param.data.sub_type_role = "sa";
    }

    if (
      param.data &&
      param.data.is_admin !== undefined &&
      param.data.is_admin !== ""
    ) {
      if (param.data.is_admin == 1) {
        param.data.is_admin = param.data.user_type !== "dds_clerk" ? "1" : "2";
      } else {
        param.data.is_admin = "0";
      }
    }

    param.data.modified_date = current_datetime;
    param.data.modified_by = req.userId;

    if (param.status == 1) {
      const oldValues = await JudgeAssistantClerk.findOne({
        where: { userId: param.data.user_id },
        raw: true,
      });

      if (!oldValues) {
        await transaction.rollback();
        return res.status(404).json({
          message: "User not found",
          success: false,
        });
      }

      await JudgeAssistantClerk.update(toModelKeys(param.data), {
        where: { userId: param.data.user_id },
        transaction,
      });

      const historyData = {
        new_values: JSON.stringify(param.data),
        old_values: JSON.stringify(oldValues),
        modified_by: req.userId,
        module_name: "users",
        action_name: "update",
        modified_date: current_datetime,
      };

      await AdminHistory.create(historyData, { transaction });
      await transaction.commit();

      return res.status(200).json({
        message: "User updated successfully",
        is_admin: param.data.is_admin,
        success: true,
      });
    } else if (param.status == 0) {
      const existingUser = await JudgeAssistantClerk.findOne({
        where: { email: param.data.email },
      });

      if (existingUser) {
        await transaction.rollback();
        return res.status(409).json({
          message: "Email-id already exist",
          success: false,
        });
      }

      param.data.created_date = current_datetime;
      param.data.created_by = req.userId;

      const newUser = await JudgeAssistantClerk.create(
        toModelKeys(param.data),
        {
          transaction,
        },
      );

      const historyData = {
        new_values: JSON.stringify(param.data),
        modified_by: req.userId,
        module_name: "users",
        action_name: "add",
        modified_date: current_datetime,
      };

      await AdminHistory.create(historyData, { transaction });
      await transaction.commit();

      return res.status(200).json({
        message: "User added successfully",
        success: true,
        data: newUser,
      });
    }

    await transaction.rollback();

    return res.status(400).json({
      message: "Invalid status parameter",
      success: false,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({
      message: error.message,
      success: false,
    });
  }
};

/*
  Name : Sharan Patil
  Date Created : 01 Sep, 2025
  Description : Users Management - Get all users
*/
// Whitelist of grid fields that may be sorted on, mapped to their Sequelize model attribute.
// Never interpolate req.query.sortBy directly into `order` — it must be validated against this list.
const SORTABLE_FIELDS = {
  LastName: "LastName",
  FirstName: "FirstName",
  email: "email",
  phone: "phone",
  Fax: "Fax",
  user_type: "user_type",
  is_active: "is_active",
};

export const admin_GetAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const requestedLimit = parseInt(req.query?.limit, 10) || 10;
    const limit = Math.min(Math.max(1, requestedLimit), 100);
    const offset = (page - 1) * limit;
    const search = (req.query?.search || "").trim();
    // Escape LIKE wildcards (%, _) so they're matched literally rather than
    // as SQL "any characters"/"any single character" patterns.
    const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
    const searchDigits = search.replace(/\D/g, "");

    const sortField = SORTABLE_FIELDS[req.query?.sortBy] || "LastName";
    const sortDirection =
      String(req.query?.sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";

    const where = search
      ? {
          [Op.or]: [
            { FirstName: { [Op.like]: `%${escapedSearch}%` } },
            { LastName: { [Op.like]: `%${escapedSearch}%` } },
            { email: { [Op.like]: `%${escapedSearch}%` } },
            { user_type: { [Op.like]: `%${escapedSearch}%` } },
            ...(searchDigits
              ? [
                  { phone: { [Op.like]: `%${searchDigits}%` } },
                  { Fax: { [Op.like]: `%${searchDigits}%` } },
                ]
              : []),
          ],
        }
      : undefined;

    const { count, rows: users } = await JudgeAssistantClerk.findAndCountAll({
      where,
      attributes: [
        "user_id",
        "FirstName",
        "LastName",
        "MiddleInitial",
        "email",
        "user_type",
        "is_admin",
        "sub_type_role",
        "phone",
        "Fax",
        "is_active",
        "is_active_billing",
        "is_administrative_personnel",
      ],
      limit,
      offset,
      order: [[sortField, sortDirection]],
    });

    const sanitizedUsers = users.map((user) => {
      const json = user.toJSON();
      if (json.phone === "0") json.phone = "";
      if (json.Fax === "0") json.Fax = "";
      return json;
    });

    return res.status(200).json({
      success: true,
      data: sanitizedUsers,
      message: "Users fetched successfully",
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Error in admin_GetAllUsers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

/*
  Name : Sharan Patil
  Date Created : 01 Sep, 2025
  Description : Users Management - Get user details by ID
*/
export const getAgencyPlatform = async (req, res) => {
  try {
    const agencyPlatform = await AgencyPlatform.findAll({
      attributes: ["id", "name", "slug", "agency_id"],
    });
    return res.status(200).json({
      success: true,
      data: agencyPlatform,
      message: "Agency platform fetched successfully",
    });
  } catch (error) {
    logger.error("Error in getAgencyPlatform:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch agency platform",
    });
  }
};
