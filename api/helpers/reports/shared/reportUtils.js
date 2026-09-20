import moment from "moment";
import { Op } from "sequelize";
import { Agency, Casetypes } from "../../../models/index.js";

/**
 * Parse date filter value to YYYY-MM-DD format
 * @param {string|null|undefined} value - Date string in various formats
 * @returns {string|null} Formatted date string or null
 */
export function parseDateFilter(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const v = value.trim();
  if (!v) return null;

  const m = moment(v, ["M-D-YYYY", "MM-DD-YYYY", "M/D/YYYY", "MM/DD/YYYY"], true);
  return m.isValid() ? m.format("YYYY-MM-DD") : null;
}

/**
 * Format date to MM-DD-YYYY format
 * @param {string|null} value - Date value
 * @returns {string|null} Formatted date or null
 */
export function formatDate(value) {
  if (value === null) return null;
  if (value === "0000-00-00") return "00-00-0000"; // preserve legacy
  return moment(value).isValid() ? moment(value).format("MM-DD-YYYY") : null;
}

/**
 * Normalize filter values to arrays
 * @param {string|Array} value - Filter value (string or array)
 * @returns {Array} Normalized array of values
 */
export function normalizeFilterToArray(value) {
  if (!value) return [];
  if (Array.isArray(value) && value.length) return value;
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Format name with comma (Last, First)
 * Database stores names as "Last First" (e.g., "Doe John")
 * This function adds a comma to make it "Last, First" (e.g., "Doe, John")
 * @param {string} name - Name in "Last First" format
 * @param {string} defaultValue - Default value if name is empty
 * @returns {string} Formatted name
 */
export function formatNameWithComma(name, defaultValue = '...') {
  if (!name || name === '(NULL)' || name === '') {
    return defaultValue;
  }
  const parts = name.split(' ');
  if (parts.length > 1) {
    return `${parts[0]}, ${parts.slice(1).join(' ')}`;
  }
  return name;
}

/**
 * Normalize simple string fields used in reports, preserving existing
 * semantics for legacy "(NULL)" placeholders.
 * Centralizing this logic reduces nesting in the main formatter.
 */
function normalizeReportField(value, fallback) {
  if (!value || value === '(NULL)') {
    return fallback;
  }
  return value;
}

/**
 * Add common filter conditions (judge, cma, agency) to where conditions array
 * Eliminates duplication across multiple report functions
 * @param {Array} whereConditions - Array of where conditions
 * @param {Object} param - Filter parameters
 */
export function addCommonFilterConditions(whereConditions, param) {
  // Judge filter
  if (Array.isArray(param.judge) && param.judge.length) {
    whereConditions.push({
      judge: { [Op.in]: param.judge }
    });
  }

  // CMA filter
  if (Array.isArray(param.cma) && param.cma.length) {
    whereConditions.push({
      cma: { [Op.in]: param.cma }
    });
  }

  // Agency filter - Use nested include syntax
  if (Array.isArray(param.agency) && param.agency.length) {
    whereConditions.push({
      '$agn.agencyCode$': { [Op.in]: param.agency }
    });
  }
}

/**
 * Build common query configuration for DecisionAutomationReport
 * Eliminates duplication between bulkdesignationReports and decisionAutomationReports
 * @param {Array} attributes - Attributes to select
 * @returns {Object} Query configuration object
 */
export function buildDecisionAutomationQuery(attributes) {
  return {
    attributes,
    include: [
      {
        model: Agency,
        as: "agn",
        required: true,
        attributes: ["agencyCode"],
      },
      {
        model: Casetypes,
        as: "casetype",
        required: true,
        attributes: ["caseCode"],
      },
    ],
  };
}

/**
 * Format case data for display in reports
 * Handles null values, date formatting, and name formatting
 * @param {Object} data - Raw case data from database
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeStatus - Include status field
 * @param {boolean} options.includeDaysSinceHearing - Calculate days since hearing
 * @param {string} options.dateReceivedKey - Key name for date received field
 * @param {string} options.hearingDateKey - Key name for hearing date field
 * @returns {Object} Formatted case data
 */
export function formatCaseDataForDisplay(data, options = {}) {
  const {
    includeStatus = false,
    includeDaysSinceHearing = true,
    dateReceivedKey = 'dateReceived',
    hearingDateKey = 'hearingDate'
  } = options;

	  // Format basic string fields using shared normalizer to reduce
	  // conditional branching while keeping behavior identical.
	  const caseName = normalizeReportField(data.caseName, 'No party Added');
	  const refAgency = normalizeReportField(data.refAgency, '...');
	  const caseType = normalizeReportField(data.caseType, '...');

  // Format dateReceived
  let dateReceived = '...';
  if (data.dateReceivedByOSAH) {
    dateReceived = moment(data.dateReceivedByOSAH).format("MM-DD-YYYY");
  }

  // Format hearingDate
  let hearingDate = '...';
  if (data.hearingDate && data.hearingDate !== '0000-00-00') {
    hearingDate = moment(data.hearingDate).format("MM-DD-YYYY");
  }

	  // Format county and hearingSite via the same helper
	  const county = normalizeReportField(data.county, '...');
	  const hearingSite = normalizeReportField(data.hearingSite, '...');

  // Format judge and judgeAssistant using helper
  const judge = formatNameWithComma(data.judge, '...');
  const judgeAssistant = formatNameWithComma(data.judgeAssistant, '...');

  // Build result object
  const result = {
    caseId: data.caseId || '...',
    caseName,
    refAgency,
    caseType,
    [dateReceivedKey]: dateReceived,
    [hearingDateKey]: hearingDate,
    county,
    hearingSite,
    judge,
    judgeAssistant,
    // Include raw dates for sorting/filtering
    dateReceivedByOSAH: data.dateReceivedByOSAH,
    hearingDateRaw: data.hearingDate
  };

  // Calculate daysSinceHearing if requested
  if (includeDaysSinceHearing) {
    let daysSinceHearing = '--';
    if (data.hearingDate && data.hearingDate !== '0000-00-00') {
      const diff = moment().diff(moment(data.hearingDate), 'days');
      if (diff > 0) {
        daysSinceHearing = diff.toString();
      }
    }
    result.daysSinceHearing = daysSinceHearing;
  }

  // Include status if requested
  if (includeStatus) {
    result.status = data.status;
  }

  return result;
}

/**
 * Build array filter condition for Sequelize queries
 * Eliminates duplication across multiple report filter builders
 * @param {Array|string|null|undefined} filterValue - Filter value (array, string, or null)
 * @param {string} fieldName - Database field name
 * @returns {Object|null} Sequelize where condition or null if no filter
 *
 * @example
 * // Returns: { judge: { [Op.in]: ['Smith John', 'Doe Jane'] } }
 * buildArrayFilter(['Smith John', 'Doe Jane'], 'judge')
 *
 * // Returns: null (no filter)
 * buildArrayFilter([], 'judge')
 */
export function buildArrayFilter(filterValue, fieldName) {
  if (Array.isArray(filterValue) && filterValue.length) {
    return { [fieldName]: { [Op.in]: filterValue } };
  }
  return null;
}

/**
 * Build date range filter condition for Sequelize queries
 * Eliminates duplication across multiple report filter builders
 * @param {string|null} dateFrom - Start date (MM-DD-YYYY format)
 * @param {string|null} dateTo - End date (MM-DD-YYYY format)
 * @param {string} fieldName - Database field name
 * @returns {Object|null} Sequelize where condition or null if no filter
 *
 * @example
 * // Returns: { hearingDate: { [Op.between]: ['2024-01-01', '2024-12-31'] } }
 * buildDateRangeFilter('01-01-2024', '12-31-2024', 'hearingDate')
 *
 */
export function buildDateRangeFilter(dateFrom, dateTo, fieldName) {
  const parsedFrom = parseDateFilter(dateFrom);
  const parsedTo = parseDateFilter(dateTo);

  if (parsedFrom && parsedTo) {
    return { [fieldName]: { [Op.between]: [parsedFrom, parsedTo] } };
  } else if (parsedFrom) {
    return { [fieldName]: { [Op.gte]: parsedFrom } };
  } else if (parsedTo) {
    return { [fieldName]: { [Op.lte]: parsedTo } };
  }
  return null;
}

/**
 * Build LIKE filter condition for Sequelize queries (case-insensitive partial match)
 * Eliminates duplication across multiple report filter builders
 * @param {string|null|undefined} filterValue - Filter value
 * @param {string} fieldName - Database field name
 * @returns {Object|null} Sequelize where condition or null if no filter
 *
 * @example
 * // Returns: { docketNumber: { [Op.like]: '%2024-001%' } }
 * buildLikeFilter('2024-001', 'docketNumber')
 */
export function buildLikeFilter(filterValue, fieldName) {
  if (filterValue && typeof filterValue === 'string' && filterValue.trim()) {
    return { [fieldName]: { [Op.like]: `%${filterValue.trim()}%` } };
  }
  return null;
}

