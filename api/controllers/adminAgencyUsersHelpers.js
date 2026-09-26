/**
 * @module adminAgencyUsersHelpers
 * @description Query helpers for the Agency Users grid (search/sort/paginate),
 * extracted from adminAgencyUsersController.js to keep that file under the
 * repo's file-size guideline.
 */

import { Op, Sequelize } from "sequelize";
import User from "../models/User.js";
import UserRoleMapping from "../models/userRoleMapping.js";
import AgencyPlatform from "../models/admin/agencyPlatformModel.js";
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

/**
 * Maps the flat request-body keys used by updateAgencyUserAction to the
 * User Sequelize model's JS attribute names.
 */
export const toUserModelKeys = (data) => {
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

/**
 * Builds the "Agency User - Create Password" welcome email, mirroring the
 * legacy PHP HTML template. The link points at the (separate, legacy)
 * agency-osah app's reset-password page — base64(user_uuid) matches the
 * legacy $receiver_userId encoding; see generateAgencyResetPasswordUrl().
 */
export const buildAgencyUserWelcomeEmail = ({ receiverName, userUuid }) => {
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

// Whitelist of grid fields that may be sorted on, mapped to the User model's
// JS attribute name (not the raw DB column) so it can be used with
// Sequelize's `order: [[{ model, as }, attribute, direction]]` syntax.
const SORTABLE_FIELDS = {
  lastname: "lastName",
  firstname: "firstName",
  email: "email",
  status: "status",
};

/**
 * Builds the Sequelize `where` clause for the agency-users list. Search
 * matches across the joined User and AgencyPlatform columns using the
 * `$association.attribute$` dot-notation Sequelize provides for exactly
 * this purpose (filtering the parent query on an included model's column).
 */
const buildAgencyUsersWhere = (search, agencyPlatformId) => {
  const conditions = [];

  if (search) {
    const like = { [Op.like]: `%${search}%` };
    conditions.push({
      [Op.or]: [
        { "$user.firstName$": like },
        { "$user.lastName$": like },
        { "$user.email$": like },
        { "$agencyPlatform.name$": like },
      ],
    });
  }

  if (agencyPlatformId) {
    conditions.push({ agency_platform_id: agencyPlatformId });
  }

  return conditions.length ? { [Op.and]: conditions } : {};
};

/**
 * Agency users are grouped one-row-per-user with a GROUP_CONCAT-style rollup
 * of every agency platform they're mapped to, which can't be expressed as a
 * plain SQL ORDER BY/LIMIT over user_role_mapping (that table has one row
 * per mapping, not per user). So pagination/sorting/search run first as a
 * Sequelize query over just the distinct, matching user IDs (grouped by
 * `user.user_id` — the User model's own primary key, so ORDER BY on any of
 * its other columns stays valid under ONLY_FULL_GROUP_BY, matching the
 * previous raw query's `GROUP BY u.user_id`); the full row data (including
 * every mapping) is then fetched via Sequelize only for that page's user IDs.
 */
export const fetchAgencyUsersData = async ({
  search = "",
  agencyPlatformId = null,
  page = 1,
  pageSize = 10,
  sortBy,
  sortOrder,
} = {}) => {
  const sortField = SORTABLE_FIELDS[sortBy] || "lastName";
  const sortDirection =
    String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";

  const where = buildAgencyUsersWhere(search, agencyPlatformId);
  // LEFT JOIN AgencyPlatform so a user with no agency platform mapping can
  // still match on name/email search — only inner-joined against User itself.
  const include = [
    { model: User, as: "user", attributes: [], required: true },
    { model: AgencyPlatform, as: "agencyPlatform", attributes: [], required: false },
  ];

  const total = await UserRoleMapping.count({
    distinct: true,
    col: "user_id",
    where,
    include,
  });

  const limit = Math.min(Math.max(1, parseInt(pageSize, 10) || 10), 100);
  const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

  const idRows = await UserRoleMapping.findAll({
    attributes: ["user_id"],
    where,
    include,
    group: [Sequelize.col("user.user_id")],
    order: [[{ model: User, as: "user" }, sortField, sortDirection]],
    limit,
    offset,
    subQuery: false,
    raw: true,
  });
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
