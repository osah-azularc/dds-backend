import { Op, fn, col, literal } from "sequelize";
import { Docket, JudgeAssistantClerk } from "../../models/index.js";
import EcourtExternalDocuments from "../../models/EcourtExternalDocuments.js";
import Form1Documents from "../../models/Form1Documents.js";
import Form1Docket from "../../models/Form1Docket.js";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import User from "../../models/User.js";
import AgencyPlatform from "../../models/admin/agencyPlatformModel.js";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import { parseDateFilter } from "./shared/reportUtils.js";
import { DOCUMENT_STATUS, SCAN_STATUS, PLATFORM_IDS } from "../../constants/constant-messages.js";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Convert platform ID to platform name
 */
function getPlatformName(platformId) {
  const platformMap = {
    [PLATFORM_IDS.ECOURT]: 'eCourt',
    [PLATFORM_IDS.PUBLIC_ACCESS]: 'Public Access',
  };
  return platformMap[String(platformId)] || null;
}

/**
 * Apply common filters for rejected documents (date, pagination, sorting)
 * @param {Object} param - Filter parameters
 * @param {Array} whereConditions - Array to push where conditions to
 * @param {string} tableName - Table name for date filter (e.g., 'Form1Documents', 'EcourtExternalDocuments')
 * @param {string} dateColumn - Date column name (e.g., 'created_date', 'createddate')
 * @returns {Object} Object containing pagination and sorting parameters
 */
function applyCommonFilters(param, whereConditions, tableName, dateColumn) {
  // Date filters - Use DATE_FORMAT for proper comparison (matching PHP logic)
  const dateFrom = parseDateFilter(param.dateReceivedfrom);
  if (dateFrom) {
    whereConditions.push(
      literal(`DATE_FORMAT(\`${tableName}\`.\`${dateColumn}\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(dateFrom)}`)
    );
  }

  const dateTo = parseDateFilter(param.dateReceivedto);
  if (dateTo) {
    whereConditions.push(
      literal(`DATE_FORMAT(\`${tableName}\`.\`${dateColumn}\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(dateTo)}`)
    );
  }

  // Pagination parameters
  const page = Number.parseInt(param.page, 10) || 0;
  const limit = Number.parseInt(param.limit, 10) || 100;
  const offset = page * limit;

  // Build dynamic ORDER BY based on sortBy parameter
  const sortBy = param.sortBy || 'uploadedDate';
  const sortOrder = (param.sortOrder || 'desc').toUpperCase();

  return { page, limit, offset, sortBy, sortOrder };
}

/**
 * Get Rejected Documents Reports
 * Fetches rejected document reports for both Ecourt/Public Access and Agency platforms
 * @param {Object} param - Filter parameters
 * @param {string} param.reportType - 'agency' or default (ecourt/public access)
 * @param {Array} param.agency - Agency filter
 * @param {Array} param.casetypes - Case types filter
 * @param {Array} param.platform - Platform filter
 * @param {Array} param.judge - Judge filter (ecourt only)
 * @param {Array} param.judgeassistant - Judge assistant filter (ecourt only)
 * @param {string} param.dateReceivedfrom - Start date filter (MM-DD-YYYY)
 * @param {string} param.dateReceivedto - End date filter (MM-DD-YYYY)
 * @returns {Array} Array of rejected document records
 */
export async function getRejectedDocuments(param) {
  try {
    const reportType = param.reportType || 'ecourt';

    if (reportType === 'agency') {
      return await getAgencyRejectedDocuments(param);
    } else {
      return await getEcourtRejectedDocuments(param);
    }
  } catch (error) {
    logger.error("getRejectedDocuments error:", error);
    throw error;
  }
}

/**
 * Get Agency Rejected Documents
 * Fetches rejected documents from form1_documents table with pagination
 */
async function getAgencyRejectedDocuments(param) {
  const whereConditions = [];

  // Static filter: is_scanned = '2' (rejected)
  whereConditions.push({ isScanned: SCAN_STATUS.REJECTED });

  // ✅ Agency filter - Apply to form1_docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.agency) && param.agency.length) {
    whereConditions.push({ '$form1Docket.refAgency$': { [Op.in]: param.agency } });
  }

  // ✅ Platform filter - Apply to platform association via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.platform) && param.platform.length) {
    whereConditions.push({ '$form1Docket.platform.id$': { [Op.in]: param.platform } });
  }

  // ✅ Case type filter - Apply to form1_docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.casetypes) && param.casetypes.length) {
    whereConditions.push({ '$form1Docket.caseType$': { [Op.in]: param.casetypes } });
  }

  // Note: Clerk filter is intentionally not applied (matches legacy PHP behavior)
  // All users can see all rejected documents regardless of who uploaded them

  // Apply common filters (date, pagination, sorting)
  const { page, limit, offset, sortBy, sortOrder } = applyCommonFilters(
    param,
    whereConditions,
    'Form1Documents',
    'created_date'
  );

  // Map frontend field names to database column paths
  const sortFieldMap = {
    documentName: [col('Form1Documents.document_name'), sortOrder],
    uploadedBy: [col('clerk.lastname'), sortOrder],
    uploadedDate: [col('Form1Documents.created_date'), sortOrder],
    platform: [col('form1Docket->platform.name'), sortOrder],
  };

  const orderBy = sortFieldMap[sortBy] || [col('Form1Documents.created_date'), 'DESC'];

  const { count, rows } = await Form1Documents.findAndCountAll({
    attributes: [
      "documentName",
      "createdBy",
      [fn("DATE_FORMAT", col("Form1Documents.created_date"), "%m-%d-%Y"), "createdDate"],
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,

    include: [
      {
        model: Form1Docket,
        as: "form1Docket",
        required: false, // ✅ LEFT JOIN (matches PHP behavior)
        attributes: ["form1Id", "agencyPlatformId", "refAgency", "caseType"], // ✅ Include filter fields for WHERE clause
        include: [
          {
            model: AgencyPlatform,
            as: "platform",
            required: false,
            attributes: ["id", "name"],
          },
        ],
      },
      {
        model: User,
        as: "clerk",
        required: false,
        attributes: [
          [fn("CONCAT", col("clerk.lastname"), ", ", col("clerk.firstname")), "clerkName"]
        ],
      },
    ],

    order: [orderBy],
    limit,
    offset,
    logging: false,
    distinct: true, // ✅ Ensure accurate count with JOINs
  });

  const data = rows.map(row => ({
    documentName: row.documentName,
    uploadedBy: row.clerk?.dataValues?.clerkName || null,
    uploadedDate: row.createdDate,
    platform: row.form1Docket?.platform?.name || null,
  }));

  return {
    data,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * Get Ecourt/Public Access Rejected Documents
 * Fetches rejected documents from ecourt_external_documents table with pagination
 */
async function getEcourtRejectedDocuments(param) {
  const whereConditions = [];

  // Static filter: status = 'Rejected'
  whereConditions.push({ status: DOCUMENT_STATUS.REJECTED });

  // ✅ Agency filter - Apply to docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.agency) && param.agency.length) {
    whereConditions.push({ '$docket.refAgency$': { [Op.in]: param.agency } });
  }

  // ✅ Case type filter - Apply to docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.casetypes) && param.casetypes.length) {
    whereConditions.push({ '$docket.caseType$': { [Op.in]: param.casetypes } });
  }

  // ✅ Judge filter - Apply to docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.judge) && param.judge.length) {
    whereConditions.push({ '$docket.judge$': { [Op.in]: param.judge } });
  }

  // ✅ Judge assistant (CMA) filter - Apply to docket table via WHERE clause (matches PHP behavior)
  if (Array.isArray(param.judgeassistant) && param.judgeassistant.length) {
    whereConditions.push({ '$docket.judgeAssistant$': { [Op.in]: param.judgeassistant } });
  }

  // Note: Clerk filter is intentionally not applied (matches legacy PHP behavior)
  // All users can see all rejected documents regardless of who uploaded them

  // Platform filter (file_added_from)
  if (Array.isArray(param.platform) && param.platform.length) {
    whereConditions.push({ fileAddedFrom: { [Op.in]: param.platform } });
  }

  // Apply common filters (date, pagination, sorting)
  const { page, limit, offset, sortBy, sortOrder } = applyCommonFilters(
    param,
    whereConditions,
    'EcourtExternalDocuments',
    'createddate'
  );

  // Map frontend field names to database column paths
  const sortFieldMap = {
    docketNo: [col('docket.caseid'), sortOrder],
    documentName: [col('EcourtExternalDocuments.document_name'), sortOrder],
    // Use COALESCE to sort by clerk OR ecourtUser (whichever exists)
    uploadedBy: [fn('COALESCE', col('clerk.LastName'), col('ecourtUser.lastname')), sortOrder],
    uploadedDate: [col('EcourtExternalDocuments.createddate'), sortOrder],
    platform: [col('EcourtExternalDocuments.file_added_from'), sortOrder],
  };

  const orderBy = sortFieldMap[sortBy] || [col('EcourtExternalDocuments.createddate'), 'DESC'];

  const { count, rows } = await EcourtExternalDocuments.findAndCountAll({
    attributes: [
      "documentName",
      "createdBy",
      "fileAddedFrom",
      [fn("DATE_FORMAT", col("EcourtExternalDocuments.createddate"), "%m-%d-%Y"), "createdDate"],
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,

    include: [
      {
        model: Docket,
        as: "docket",
        required: false, // ✅ LEFT JOIN (matches PHP behavior)
        attributes: ["caseId", "refAgency", "caseType", "judge", "judgeAssistant"], // ✅ Include filter fields for WHERE clause
      },
      {
        model: JudgeAssistantClerk,
        as: "clerk",
        required: false,
        attributes: [
          [fn("CONCAT", col("clerk.LastName"), ", ", col("clerk.FirstName")), "clerkName"]
        ],
      },
      {
        model: PublicAccessUser,
        as: "ecourtUser",
        required: false,
        attributes: [
          [fn("CONCAT", col("ecourtUser.lastname"), ", ", col("ecourtUser.firstname")), "ecourtUserClerk"]
        ],
      },
    ],

    order: [orderBy],
    limit,
    offset,
    distinct: true, // ✅ Ensure accurate count with JOINs
  });

  const data = rows.map(row => {
    const clerkName = row.clerk?.dataValues?.clerkName || null;
    const ecourtUserClerk = row.ecourtUser?.dataValues?.ecourtUserClerk || null;
    const uploadedBy = clerkName || ecourtUserClerk || null;

    return {
      docketNo: row.docket?.caseId || null,
      documentName: row.documentName,
      uploadedBy: uploadedBy,
      uploadedDate: row.createdDate,
      platform: getPlatformName(row.fileAddedFrom),
    };
  });

  return {
    data,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
}

