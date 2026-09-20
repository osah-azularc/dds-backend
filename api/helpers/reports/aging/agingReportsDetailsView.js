import { Op, literal } from "sequelize";
import { Docket } from "../../../models/index.js";
import { formatCaseDataForDisplay } from "../shared/reportUtils.js";

/**
 * Sort field mapping for aging reports details view
 */
const SORT_FIELD_MAP = {
  docket: 'caseId',
  caseName: 'caseName',
  agency: 'refAgency',
  caseType: 'caseType',
  county: 'county',
  location: 'hearingSite',
  judge: 'judge',
  cma: 'judgeAssistant',
  dateReceived: 'dateReceivedByOSAH',
  hearingDate: 'hearingDate',
  status: 'status',
};

/**
 * Fetch details view data for aging reports
 * @param {Array} whereConditions - Where conditions array
 * @param {Object} detailsView - Details view parameters
 * @param {boolean} exportMode - Whether this is export mode
 * @returns {Promise<Array>} Array of case records
 */
export async function fetchAgingReportsDetails(whereConditions, detailsView, exportMode = false) {
  const queryOptions = {
    attributes: [
      "caseId",
      "caseName",
      "refAgency",
      "caseType",
      "dateReceivedByOSAH",
      "hearingDate",
      "county",
      "hearingSite",
      "judge",
      "judgeAssistant",
      "status"
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    subQuery: false, // ✅ Disable subquery for better performance
    logging: false,
  };

  // Add sorting
  const sortBy = detailsView?.sortBy;
  const sortOrder = detailsView?.sortOrder || 'asc';

  if (sortBy && SORT_FIELD_MAP[sortBy]) {
    const dbColumn = SORT_FIELD_MAP[sortBy];
    queryOptions.order = [[dbColumn, sortOrder.toUpperCase()]];
  } else if (sortBy === 'dateSinceHearing') {
    queryOptions.order = [[literal(`DATEDIFF(CURDATE(), \`hearingDate\`) ${sortOrder.toUpperCase()}`)]];
  } else {
    // Default sort
    queryOptions.order = [
      ["dateReceivedByOSAH", "ASC"],
      ["caseId", "ASC"]
    ];
  }

	  // Add pagination (skip for export mode)
	  let limit;
	  let page = 0;
	  if (!exportMode) {
	    limit = detailsView?.limit || 20;
	    page = detailsView?.page || 0;
	    const offset = page * limit;
	    queryOptions.limit = limit;
	    queryOptions.offset = offset;
	  }

  const results = await Docket.findAll(queryOptions);

  // Transform to camelCase format for frontend
  return results.map(row => {
    const data = row.get({ plain: true });
    return formatCaseDataForDisplay(data, {
      includeStatus: true,
      includeDaysSinceHearing: true
    });
  });
}

/**
 * Build pagination metadata for details view
 * @param {number} total - Total count
 * @param {Object} detailsView - Details view parameters
 * @returns {Object} Pagination metadata
 */
export function buildPaginationMetadata(total, detailsView) {
  const limit = detailsView?.limit || 20;
  const page = detailsView?.page || 0;

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

