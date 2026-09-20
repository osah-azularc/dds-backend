import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { mysqlSequelize } from "../../connections/seqDB.js";
import AdminHistory from "../models/admin/adminHistoryModel.js";
import AgencyPlatform from "../models/admin/agencyPlatformModel.js";
import User from "../models/User.js";
import UserRoleMapping from "../models/userRoleMapping.js";
import sendsgMail from "../utilities/sendsgMail.js";
import { generateAgencyResetPasswordUrl } from "../helpers/urlHelper.js";

// Association not defined in model file — set it once here
if (!UserRoleMapping.associations.agencyPlatform) {
  UserRoleMapping.belongsTo(AgencyPlatform, {
    foreignKey: "agency_platform_id",
    as: "agencyPlatform",
  });
}

// phone and fax are integer columns in user_master — empty string is invalid
const INTEGER_FIELDS = new Set(["phone", "fax"]);

const toUserModelKeys = (data) => {
  const keyMap = {
    firstname: "firstName",
    lastname: "lastName",
    middlename: "middleName",
    phone: "phone",
    fax: "fax",
    email: "email",
    status: "status",
    password: "password",
    last_login: "lastLogin",
    created_by: "createdBy",
    modified_by: "modifiedBy",
    created_date: "createdDate",
    modified_date: "modifiedDate",
  };
  const mapped = {};
  for (const [raw, attr] of Object.entries(keyMap)) {
    if (data[raw] !== undefined) {
      mapped[attr] =
        INTEGER_FIELDS.has(raw) && data[raw] === "" ? null : data[raw];
    }
  }
  return mapped;
};

// Whitelist of grid fields that may be sorted on, mapped to their raw SQL column.
// Never interpolate req.query.sortBy directly into the ORDER BY — it must be
// validated against this list first.
const SORTABLE_FIELDS = {
  lastname: "u.lastname",
  firstname: "u.firstname",
  email: "u.email",
  status: "u.status",
};

/**
 * Agency users are grouped one-row-per-user with a GROUP_CONCAT-style rollup of
 * every agency platform they're mapped to, which can't be expressed as a plain
 * SQL ORDER BY/LIMIT over user_role_mapping (that table has one row per mapping,
 * not per user). So pagination/sorting/search run first as a raw-SQL query over
 * just the distinct, matching user IDs; the full row data (including every
 * mapping) is then fetched via Sequelize only for that page's user IDs.
 */
const fetchAgencyUsersData = async ({
  search = "",
  agencyPlatformId = null,
  page = 1,
  pageSize = 10,
  sortBy,
  sortOrder,
} = {}) => {
  const sortField = SORTABLE_FIELDS[sortBy] || "u.lastname";
  const sortDirection =
    String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";

  const whereClauses = [];
  const replacements = {};
  if (search) {
    whereClauses.push(
      "(u.firstname LIKE :search OR u.lastname LIKE :search OR u.email LIKE :search OR ap.name LIKE :search)",
    );
    replacements.search = `%${search}%`;
  }
  if (agencyPlatformId) {
    whereClauses.push("m.agency_platform_id = :agencyPlatformId");
    replacements.agencyPlatformId = agencyPlatformId;
  }
  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";
  // LEFT JOIN so a user with no agency platform mapping can still match on
  // name/email search — only inner-joined against user_role_mapping itself.
  const joinSQL = `
     FROM user_master u
     INNER JOIN user_role_mapping m ON m.user_id = u.user_id
     LEFT JOIN agency_platform ap ON ap.id = m.agency_platform_id`;

  const [countRows] = await mysqlSequelize.query(
    `SELECT COUNT(DISTINCT u.user_id) as total
     ${joinSQL}
     ${whereSQL}`,
    { replacements, raw: true },
  );
  const total = Number(countRows[0]?.total ?? 0);

  const limit = Math.min(Math.max(1, parseInt(pageSize, 10) || 10), 100);
  const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

  const [idRows] = await mysqlSequelize.query(
    `SELECT u.user_id
     ${joinSQL}
     ${whereSQL}
     GROUP BY u.user_id
     ORDER BY ${sortField} ${sortDirection}
     LIMIT :limit OFFSET :offset`,
    { replacements: { ...replacements, limit, offset }, raw: true },
  );
  const pagedUserIds = idRows.map((row) => row.user_id);

  if (pagedUserIds.length === 0) {
    return { rows: [], total };
  }

  const mappings = await UserRoleMapping.findAll({
    where: { user_id: { [Op.in]: pagedUserIds } },
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "userId",
          "firstName",
          "lastName",
          "middleName",
          "phone",
          "fax",
          "email",
          "status",
        ],
        required: true,
      },
      {
        model: AgencyPlatform,
        as: "agencyPlatform",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  });

  // Replicate GROUP BY u.user_id + GROUP_CONCAT(apm.name / apm.id)
  const userMap = new Map();
  mappings.forEach((m) => {
    const u = m.user;
    const userId = u.userId;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        mapping_id: m.mapping_id,
        agency_id: m.agency_id,
        agency_platform_id: m.agency_platform_id,
        user_role_type: m.user_role_type,
        user_id: userId,
        firstname: u.firstName,
        lastname: u.lastName,
        middlename: u.middleName,
        phone: u.phone,
        fax: u.fax,
        email: u.email,
        status: u.status,
        _names: [],
        _apmIds: [],
      });
    }
    const entry = userMap.get(userId);
    if (m.agencyPlatform) {
      entry._names.push(m.agencyPlatform.name);
      entry._apmIds.push(String(m.agencyPlatform.id));
    }
  });

  // Re-apply the sorted/paginated order from the ID query — Sequelize's
  // Op.in fetch above has no guaranteed ordering of its own.
  const rows = pagedUserIds
    .map((userId) => userMap.get(userId))
    .filter(Boolean)
    .map(({ _names, _apmIds, ...rest }) => ({
      ...rest,
      name: _names.length ? _names.join(",") : null,
      apmId: _apmIds,
    }));

  return { rows, total };
};

/**
 * Builds the "Agency User - Create Password" welcome email, mirroring the
 * legacy PHP HTML template. The link points at the (separate, legacy)
 * agency-osah app's reset-password page — base64(user_uuid) matches the
 * legacy $receiver_userId encoding; see generateAgencyResetPasswordUrl().
 */
const buildAgencyUserWelcomeEmail = ({ receiverName, userUuid }) => {
  const receiverUserId = Buffer.from(userUuid).toString("base64");
  const setupLink = generateAgencyResetPasswordUrl(receiverUserId);

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <title>OSAH</title>
      <meta name='viewport' content='width=device-width, initial-scale=1.0, user-scalable=no'>
      <link href='https://fonts.googleapis.com/css?family=PT+Serif:400,700|Raleway:300,400,500,700|Roboto:300,400,500,700' rel='stylesheet'>
    </head>
    <body>
      <div style='width: 820px; background: #f1f1f1; padding: 46px 60px; margin: 0 auto; border: 1px solid #d5d7db;'>
        <div style='background: #fff; border: 1px solid #d5d7db;'>
          <div style='padding: 10px 30px;'>
            <a style='display: inline-block;'>
              <img src='https://eportal.osah.ga.gov/external/images/osah-email-logo.jpg' alt='Logo' />
            </a>
          </div>
          <div style='height: 195px; border-top: 1px solid #d5d7db; border-bottom: 1px solid #d5d7db; padding: 60px 30px;'>
            <p style='font-family: Roboto, sans-serif; font-size: 16px; font-weight: 300; color: #737c8c; margin: 0;'>
              Hi ${receiverName},<br/>
              Welcome to OSAH's Agency Platform! As an agency user you'll have access to submit, search, print Form 1s, and more all in a single web app. To get started, create your password using the link below.<br/><br/>
              <a style='font-family: Roboto, sans-serif; font-size: 16px; font-weight: 300; color: #d6a329;' href='${setupLink}'>Click here to generate the password</a>
            </p>
          </div>
          <div>
            <p style='font-family: Roboto, sans-serif; font-size: 16px; font-weight: 300; color: #737c8c; margin: 0; text-align: center; padding: 25px;'>For assistance, please contact <a style='font-family: Roboto, sans-serif; font-size: 16px; font-weight: 700; color: #737c8c;'>agencyportal@osah.ga.gov</a>.</p>
          </div>
        </div>
      </div>
    </body>
  </html>`;

  return { subject: "Agency User - Create Password", html };
};

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
