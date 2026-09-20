import { Op, literal } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import DocumentsTable from '../models/DocumentsTable.js';

/**
 * Dashboard Query Builder Utilities
 * Helper functions for building Sequelize where conditions for dashboard searches
 */

/**
 * Helper function to build array condition for Sequelize where clause
 * Handles both array and single value inputs
 * 
 * @param {string} field - Database field name (e.g., 'county', 'refAgency')
 * @param {Array|string|number} value - Value to filter by (array or single value)
 * @returns {Object|null} - Sequelize where condition object or null if empty array
 * 
 * @example
 * // Array with values
 * buildArrayCondition('county', ['Fulton', 'Cobb'])
 * // Returns: { county: { [Op.in]: ['Fulton', 'Cobb'] } }
 * 
 * // Single value
 * buildArrayCondition('county', 'Fulton')
 * // Returns: { county: 'Fulton' }
 * 
 * // Empty array
 * buildArrayCondition('county', [])
 * // Returns: null
 */
export const buildArrayCondition = (field, value) => {
  if (Array.isArray(value)) {
    // Skip empty arrays
    if (value.length === 0) return null;
    // Use Op.in for non-empty arrays
    return { [field]: { [Op.in]: value } };
  }
  // Single value (string or number)
  return { [field]: value };
};

/**
 * Build status condition for general search
 * Handles special cases: NA, All, and specific status values
 * 
 * @param {string} status - Status value from search form
 * @returns {Object} - Sequelize where condition object
 * 
 * @example
 * buildStatusCondition('NA')
 * // Returns: { status: { [Op.ne]: 'Closed' } }
 * 
 * buildStatusCondition('ALL')
 * // Returns: { [Op.and]: [{ status: { [Op.ne]: null } }, { status: { [Op.ne]: '' } }] }
 * 
 * buildStatusCondition('Pending')
 * // Returns: { status: 'Pending' }
 */
export const buildStatusCondition = (status) => {
  if (!status || status === '' || status === 'NA') {
    // Exclude closed cases
    return { status: { [Op.ne]: 'Closed' } };
  }
  
  if (status.toUpperCase() === 'ALL') {
    // Include all non-empty statuses
    return {
      [Op.and]: [
        { status: { [Op.ne]: null } },
        { status: { [Op.ne]: '' } }
      ]
    };
  }
  
  // docket.status stores this as plain "Rescheduled" for current data, but older rows may
  // still hold the legacy "Hearing Re-Scheduled" literal — match both.
  if (status.toLowerCase() === 'rescheduled') {
    return { status: { [Op.in]: ['Rescheduled', 'Hearing Re-scheduled', 'Hearing Re-Scheduled'] } };
  }

  return { status };
};

/**
 * Build date range condition using DATE_FORMAT to avoid timezone issues
 * 
 * @param {string} field - Database field name (e.g., 'hearingdate', 'closed_date')
 * @param {string} fromDate - Start date in YYYY-MM-DD format
 * @param {string} toDate - End date in YYYY-MM-DD format
 * @returns {Array} - Array of literal conditions for from and to dates
 * 
 * @example
 * buildDateRangeCondition('hearingdate', '2024-01-01', '2024-12-31')
 * // Returns: [
 * //   literal("DATE_FORMAT(`Docket`.`hearingdate`, '%Y-%m-%d') >= '2024-01-01'"),
 * //   literal("DATE_FORMAT(`Docket`.`hearingdate`, '%Y-%m-%d') <= '2024-12-31'")
 * // ]
 */
export const buildDateRangeCondition = (field, fromDate, toDate) => {
  const conditions = [];
  
  if (fromDate) {
    conditions.push(
      literal(`DATE_FORMAT(\`Docket\`.\`${field}\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(fromDate)}`)
    );
  }
  
  if (toDate) {
    conditions.push(
      literal(`DATE_FORMAT(\`Docket\`.\`${field}\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(toDate)}`)
    );
  }
  
  return conditions;
};

/**
 * Build where conditions for general search
 * 
 * @param {Object} condition - Search condition object from request
 * @returns {Array} - Array of where conditions for Sequelize
 */
export const buildGeneralSearchConditions = (condition) => {
  const whereConditions = [];

  // Base condition: telv_o_five = '1' (ALWAYS REQUIRED)
  whereConditions.push({ telvOFive: '1' });

  // Case IDs filter - ONLY add if array has values
  if (condition.caseIds && Array.isArray(condition.caseIds) && condition.caseIds.length > 0) {
    whereConditions.push({ caseId: { [Op.in]: condition.caseIds } });
  }

  // Text field filters
  if (condition.agencyRefNumber) {
    whereConditions.push({ agencyRefNumber: condition.agencyRefNumber });
  }

  // Array field filters
  if (condition.county) {
    const countyCondition = buildArrayCondition('county', condition.county);
    if (countyCondition) whereConditions.push(countyCondition);
  }

  // Status handling (special logic) - ALWAYS process status, even if 'NA'
  // Only skip if we're filtering by specific case IDs
  if (!condition.caseIds || condition.caseIds.length === 0) {
    // Handle statusNotIn first (takes precedence)
    if (condition.statusNotIn && Array.isArray(condition.statusNotIn) && condition.statusNotIn.length > 0) {
      whereConditions.push({ 
        status: { 
          [Op.notIn]: condition.statusNotIn 
        } 
      });
    } else {
      // Use buildStatusCondition for 'NA', empty, or specific status values
      const statusCondition = buildStatusCondition(condition.status);
      whereConditions.push(statusCondition);
    }
  }

  if (condition.refAgency) {
    const refAgencyCondition = buildArrayCondition('refAgency', condition.refAgency);
    if (refAgencyCondition) whereConditions.push(refAgencyCondition);
  }

  if (condition.caseType) {
    const caseTypeCondition = buildArrayCondition('caseType', condition.caseType);
    if (caseTypeCondition) whereConditions.push(caseTypeCondition);
  }

  // Single-select filters
  if (condition.judge) {
    whereConditions.push({ judge: condition.judge });
  }

  if (condition.staffAttorney) {
    whereConditions.push({ staffAttorney: condition.staffAttorney });
  }

  if (condition.judgeAssistant) {
    whereConditions.push({ judgeAssistant: condition.judgeAssistant });
  }

  if (condition.hearingSite) {
    whereConditions.push({ hearingSite: condition.hearingSite });
  }

  if (condition.hearingType) {
    whereConditions.push({ hearingMode: condition.hearingType });
  }

  if (condition.hearingTime) {
    whereConditions.push({ hearingTime: condition.hearingTime });
  }

  // Date range filters
  if (condition.hearingDateFrom || condition.hearingDateTo) {
    const dateConditions = buildDateRangeCondition('hearingdate', condition.hearingDateFrom, condition.hearingDateTo);
    whereConditions.push(...dateConditions);
  }

  if (condition.dateReceivedByOSAHFrom || condition.dateReceivedByOSAHTo) {
    const dateConditions = buildDateRangeCondition('datereceivedbyOSAH', condition.dateReceivedByOSAHFrom, condition.dateReceivedByOSAHTo);
    whereConditions.push(...dateConditions);
  }

  if (condition.dateRequestedFrom || condition.dateRequestedTo) {
    const dateConditions = buildDateRangeCondition('daterequested', condition.dateRequestedFrom, condition.dateRequestedTo);
    whereConditions.push(...dateConditions);
  }

  return whereConditions;
};

/**
 * Build where conditions for closed cases search
 *
 * @param {Object} condition - Search condition object from request
 * @returns {Array} - Array of where conditions for Sequelize
 */
export const buildClosedCasesSearchConditions = (condition) => {
  const whereConditions = [];

  // Required: status = 'Closed'
  whereConditions.push({ status: 'Closed' });

  // Required date range
  if (condition.dateClosedFrom || condition.dateClosedTo) {
    const dateConditions = buildDateRangeCondition('closed_date', condition.dateClosedFrom, condition.dateClosedTo);
    whereConditions.push(...dateConditions);
  }

  // Optional filters
  if (condition.judge) {
    whereConditions.push({ judge: condition.judge });
  }

  if (condition.agency) {
    const agencyCondition = buildArrayCondition('refAgency', condition.agency);
    if (agencyCondition) whereConditions.push(agencyCondition);
  }

  if (condition.caseType) {
    const caseTypeCondition = buildArrayCondition('caseType', condition.caseType);
    if (caseTypeCondition) whereConditions.push(caseTypeCondition);
  }

  if (condition.county) {
    const countyCondition = buildArrayCondition('county', condition.county);
    if (countyCondition) whereConditions.push(countyCondition);
  }

  return whereConditions;
};

/**
 * Get case IDs with Decision documents
 * Used for "Open Cases With Decision" dashboard widget
 * @returns {Promise<Array>} - Array of case IDs
 */
export const getCaseIdsWithDecision = async () => {
  const casesWithDecision = await DocumentsTable.findAll({
    attributes: [[mysqlSequelize.fn('DISTINCT', mysqlSequelize.col('caseid')), 'caseid']],
    where: {
      DocumentType: 'Decision',
      roc_flag: '0',
    },
    raw: true,
  });
  
  return casesWithDecision.map(c => c.caseid);
};

/**
 * Get case IDs with NOH documents
 * Used for "Dockets Received" dashboard widget
 * @returns {Promise<Array>} - Array of case IDs
 */
export const getCaseIdsWithNOH = async () => {
  const casesWithNOH = await DocumentsTable.findAll({
    attributes: [[mysqlSequelize.fn('DISTINCT', mysqlSequelize.col('caseid')), 'caseid']],
    where: {
      DocumentType: {
        [Op.in]: ['NOH', 'B-NOH', 'NOH-Motion', 'T-NOH', 'Notice Of Hearing'],
      },
    },
    raw: true,
  });
  
  return casesWithNOH.map(c => c.caseid);
};

/**
 * Apply special document filters to where conditions
 * Handles "withDecisionDocument", "withoutNOH", and "excludeNOH" filters
 * 
 * @param {Array} whereConditions - Existing where conditions array
 * @param {Object} condition - Search condition object
 * @returns {Promise<Object|null>} - Returns early response object if no results, null to continue
 */
export const applyDocumentFilters = async (whereConditions, condition) => {
  // Filter: Cases with Decision documents (for CMA dashboard "See All")
  if (condition.withDecisionDocument) {
    const caseIdsWithDecision = await getCaseIdsWithDecision();
    
    if (caseIdsWithDecision.length > 0) {
      whereConditions.push({ caseId: { [Op.in]: caseIdsWithDecision } });
    } else {
      return {
        success: true,
        message: 'No results found',
        data: [],
        total: 0,
        error: null,
      };
    }
  }

  // Filter: Cases without NOH documents (for Dockets Received "See All")
  if (condition.withoutNOH || condition.excludeNOH) {
    const caseIdsWithNOH = await getCaseIdsWithNOH();
    
    if (caseIdsWithNOH.length > 0) {
      whereConditions.push({ caseId: { [Op.notIn]: caseIdsWithNOH } });
    }
  }

  return null;
};
