import { Op, fn, col, literal, where } from "sequelize";
import { Docket } from "../../models/index.js";
import { ValidationError } from "../validators.js";
import { formatCaseDataForDisplay } from "./shared/reportUtils.js";

const buildDetailsWhereConditions = (baseWhereConditions, detailsView) => {
  const detailsWhereConditions = [...baseWhereConditions];

  if (detailsView && Object.keys(detailsView).length) {
    const detailKey = Object.keys(detailsView)[0];
    const detailValue = detailsView[detailKey];

    const allowedDetailKeys = [
      'judge',
      'judgeassistant',
      'staffattorney',
      'docketclerk',
      'casetype',
      'refagency',
    ];

    if (!allowedDetailKeys.includes(detailKey)) {
      throw new ValidationError(
        `Invalid detail key: ${detailKey}. Allowed values: ${allowedDetailKeys.join(', ')}`,
        'detailsView',
      );
    }

    if (detailValue === 'UNASSIGNED') {
      detailsWhereConditions.push({
        [Op.or]: [
          { [detailKey]: { [Op.in]: ['', 'UNASSIGNED'] } },
          { [detailKey]: { [Op.is]: null } },
        ],
      });
    } else if (detailKey === 'docketclerk') {
      detailsWhereConditions.push(
        where(
          fn('CONCAT', col('jac.LastName'), literal("' '"), col('jac.FirstName')),
          Op.eq,
          detailValue,
        ),
      );
    } else {
      detailsWhereConditions.push({ [detailKey]: detailValue });
    }
  }

  return detailsWhereConditions;
};

const buildOrderBy = (sortBy, sortOrder) => {
  const sortFieldMap = {
    caseId: [col('Docket.caseId'), sortOrder],
    caseName: [col('Docket.caseName'), sortOrder],
    refAgency: [col('Docket.refAgency'), sortOrder],
    caseType: [col('Docket.caseType'), sortOrder],
    county: [col('Docket.county'), sortOrder],
    hearingSite: [col('Docket.hearingSite'), sortOrder],
    judge: [col('Docket.judge'), sortOrder],
    judgeAssistant: [col('Docket.judgeAssistant'), sortOrder],
    dateReceivedByOSAH: [col('Docket.dateReceivedByOSAH'), sortOrder],
    dateReceivedDisplay: [col('Docket.dateReceivedByOSAH'), sortOrder],
    hearingDate: [col('Docket.hearingDate'), sortOrder],
    hearingDateDisplay: [col('Docket.hearingDate'), sortOrder],
    daysSinceHearing: [
      literal(`DATEDIFF(CURDATE(), \`Docket\`.\`hearingDate\`) ${sortOrder}`),
    ],
  };

  return sortFieldMap[sortBy] || [col('Docket.caseId'), 'ASC'];
};

/**
 * Get monthly reports details view data
 * @param {Array} whereConditions - SQL where conditions
 * @param {Array} include - Sequelize include array for joins
 * @param {Object} detailsView - Details view filter (e.g., {judge: "Smith, John"})
 * @param {string} responseType - Response type ('export' or undefined)
 * @param {boolean} isDateAfter2_5FeaturesDeployed - Whether date range is after 2.5 features
 * @returns {Promise<Object>} Details data with totalCount and details array
 */
export async function getMonthlyReportsDetailsView(whereConditions, include, detailsView, responseType, isDateAfter2_5FeaturesDeployed) {
  const result = {};

  // Fetch raw data using camelCase attributes (matching Docket model)
  const attributes = [
    'caseId',
    'caseName',
    'refAgency',
    'caseType',
    'dateReceivedByOSAH',
    'hearingDate',
    'county',
    'hearingSite',
    'judge',
    'judgeAssistant',
  ];

	  // Add additional where conditions for details view
	  const detailsWhereConditions = buildDetailsWhereConditions(
	    whereConditions,
	    detailsView,
	  );

  // ✅ Get total count for pagination support (always fetch count for details view)
  const countResult = await Docket.count({
    include,
    where: detailsWhereConditions.length ? { [Op.and]: detailsWhereConditions } : undefined,
    group: detailsView?.docketclerk ? ['Docket.caseId'] : undefined,
  });

  // Handle grouped count (returns array) vs simple count (returns number)
  const totalCount = Array.isArray(countResult) ? countResult.length : countResult;
  result.totalCount = totalCount;

  // Legacy support: clerkActivitiesCount for docketclerk view
  if (detailsView?.docketclerk) {
    result.clerkActivitiesCount = totalCount;
  }

	  // ✅ Build dynamic ORDER BY based on sortBy parameter
	  const sortBy = detailsView?.sortBy || 'caseId';
	  const sortOrder = (detailsView?.sortOrder || 'asc').toUpperCase();
	  const orderBy = buildOrderBy(sortBy, sortOrder);

  // ✅ Fetch details data with optional pagination support
  // Note: Pagination is optional - if not provided, returns all results (backward compatible)
  const queryOptions = {
    attributes,
    include,
    where: detailsWhereConditions.length ? { [Op.and]: detailsWhereConditions } : undefined,
    group: detailsView?.docketclerk ? ['Docket.caseId'] : undefined,
    order: [orderBy],
    subQuery: false, // ✅ Disable subquery to prevent "Unknown column" error when using GROUP BY with joined table conditions
  };

	  // ✅ Add pagination if limit is provided (prevents loading thousands of rows)
	  // For export mode: ALWAYS fetch all records (no limit/offset)
	  // For details view: use provided limit/offset or defaults (page-based pagination)
	  let page = 0;
	  let limit; // Initialized to undefined by default

	  if (responseType === 'export') {
	    // no pagination in export mode
	    limit = undefined;
	  } else {
	    page = detailsView?.page || 0;
	    limit = detailsView?.limit || 20;
	    const offset = page * limit;

	    queryOptions.limit = limit;
	    queryOptions.offset = offset;
	  }

  const details = await Docket.findAll(queryOptions);

  // ✅ Transform to camelCase format with proper formatting
  // Uses shared formatCaseDataForDisplay helper to eliminate duplication
  result.details = details.map(row => {
    const data = row.get({ plain: true });
    return formatCaseDataForDisplay(data, {
      includeStatus: false,
      includeDaysSinceHearing: true,
      dateReceivedKey: 'dateReceivedDisplay',
      hearingDateKey: 'hearingDateDisplay'
    });
  });

  // ✅ Add pagination metadata for frontend
  if (limit !== undefined && responseType !== 'export') {
    result.pagination = {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  return result;
}

