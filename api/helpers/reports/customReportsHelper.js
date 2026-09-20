import { Op, fn, col, literal } from 'sequelize';
import { Docket } from '../../models/index.js';
import { buildWhereConditions, buildIncludeArray } from './customReportsFilterBuilder.js';
import { formatDashboardData, formatDetailsData, FIELD_MAPPING } from './customReportsFormatter.js';
import { logger } from "../../../config/winstonLogger.js";

/**
 * Custom Reports Helper
 * Handles complex filtering with 14 filters and supports both dashboard and details views
 * 
 * @param {Object} request - Request object
 * @param {Object} request.filters - Filter object with 14 filters
 * @param {string} request.viewType - 'judges' or 'casetypes'
 * @param {Object} request.detailsView - Optional details view config
 * @param {boolean} request.exportMode - Whether to export all data (no pagination)
 * 
 * @returns {Promise<Object>} Report data
 */
export async function customReports(request) {
  try {
    const filters = request.filters || {};
    const viewType = request.viewType || 'judges';
    const detailsView = request.detailsView;
    const exportMode = request.exportMode || false;

    // Build where conditions and include array from filters
    const whereConditions = buildWhereConditions(filters);
    const include = buildIncludeArray(filters);

    // Determine if this is dashboard view or details view
    if (detailsView) {
      // DETAILS VIEW - Show paginated table of cases
      return await getDetailsView(whereConditions, include, detailsView, viewType, exportMode);
    } else {
      // DASHBOARD VIEW - Show grouped data by judge or case type
      return await getDashboardView(whereConditions, include, viewType);
    }
  } catch (error) {
    logger.error('Error in customReports helper:', error);
    throw error;
  }
}

/**
 * Get dashboard view - grouped by judge or case type
 * Returns data in the same format as monthly report for consistent UI
 */
async function getDashboardView(whereConditions, include, viewType) {
  const groupByField = viewType === 'judges' ? 'judge' : 'caseType';

  // Fetch grouped data
  // When joining with DocketOpenCloseDetails, we need to qualify column names
  const results = await Docket.findAll({
    attributes: [
      groupByField,
      'caseType',
      'refAgency',
      [fn('COUNT', col('Docket.caseId')), 'count'],
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    include,
    group: [groupByField, 'caseType', 'refAgency'],
    raw: true,
  });

  // Transform and format results
  return formatDashboardData(results, viewType);
}

/**
 * Get details view - paginated table of cases
 */
async function getDetailsView(whereConditions, include, detailsView, viewType, exportMode) {
  // Add filter for selected item (judge or case type)
  if (detailsView.itemName) {
    // Use viewType to determine if filtering by judge or case type
    if (viewType === 'judges') {
      whereConditions.push({ judge: detailsView.itemName });
    } else {
      whereConditions.push({ caseType: detailsView.itemName });
    }
  }

  // Determine sort field and order
  // Default to 'caseId' (frontend field name) which maps to 'caseId' in database
  // This ensures data is sorted by docket number (caseId) in ascending order by default
  const sortBy = detailsView.sortBy || 'caseId';
  const sortOrder = (detailsView.sortOrder || 'asc').toUpperCase();
  const dbSortField = FIELD_MAPPING[sortBy] || sortBy;

  // Build order clause
  let orderClause;

  // Special handling for daysSinceHearing: use SQL DATEDIFF with NULL handling
  // ASC: NULL/empty first, then smallest days first (most recent hearings)
  // DESC: largest days first (oldest hearings), then NULL/empty last
  if (sortBy === 'daysSinceHearing') {
    if (sortOrder === 'ASC') {
      // ASC: NULL first, then smallest to largest days
      orderClause = [
        literal(`CASE
          WHEN \`Docket\`.\`hearingDate\` IS NULL OR \`Docket\`.\`hearingDate\` = '0000-00-00' THEN 0
          ELSE 1
        END ASC`),
        literal(`DATEDIFF(CURDATE(), \`Docket\`.\`hearingDate\`) ASC`)
      ];
    } else {
      // DESC: largest to smallest days, then NULL last
      orderClause = [
        literal(`CASE
          WHEN \`Docket\`.\`hearingDate\` IS NULL OR \`Docket\`.\`hearingDate\` = '0000-00-00' THEN 1
          ELSE 0
        END ASC`),
        literal(`DATEDIFF(CURDATE(), \`Docket\`.\`hearingDate\`) DESC`)
      ];
    }
  } else {
    // Standard sorting for other fields
    orderClause = [[col(`Docket.${dbSortField}`), sortOrder]];
  }

  // Build query options
  // When joining with DocketOpenCloseDetails, qualify column names to avoid ambiguity
  const queryOptions = {
    attributes: [
      [col('Docket.caseId'), 'caseId'],
      'docketNumber',
      'caseName',
      'refAgency',
      'caseType',
      'dateReceivedByOSAH',
      'hearingDate',
      'county',
      'hearingSite',
      'judge',
      'judgeAssistant',
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    include,
    order: orderClause,
    subQuery: false, // Disable subquery to avoid ambiguity issues
    // Use distinct count when there are joins to avoid counting duplicate rows
    distinct: include.length,
    col: include.length ? 'caseId' : undefined, // Count distinct caseId when using joins
  };

  // Add pagination if not export mode
  if (!exportMode) {
    const page = detailsView.page || 0;
    const limit = detailsView.limit || 20;
    const offset = page * limit;

    queryOptions.limit = limit;
    queryOptions.offset = offset;
  }

  // Fetch data
  const { count, rows } = await Docket.findAndCountAll(queryOptions);

  // Transform rows to match frontend expectations
  const details = formatDetailsData(rows);

  // Return with pagination info
  if (exportMode) {
    return { details };
  }

  const limit = detailsView.limit || 20;
  const page = detailsView.page || 0;

  return {
    details,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  };
}

