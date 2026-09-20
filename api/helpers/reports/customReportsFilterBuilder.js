import { Op } from 'sequelize';
import { DocketOpenCloseDetails } from '../../models/index.js';
import { buildArrayFilter, buildDateRangeFilter } from './shared/reportUtils.js';

/**
 * Build where conditions from 14 filters for Custom Reports
 *
 * @param {Object} filters - Filter object with 14 filters
 * @returns {Array} Array of where conditions for Sequelize
 */
export function buildWhereConditions(filters) {
  const whereConditions = [];

  // Base condition: telv_o_five = '1' (active cases)
  whereConditions.push({ telvOFive: '1' });

  const countyFilter = buildArrayFilter(filters.county, 'county');
  if (countyFilter) whereConditions.push(countyFilter);

  const agencyFilter = buildArrayFilter(filters.agency, 'refAgency');
  if (agencyFilter) whereConditions.push(agencyFilter);

  const caseTypeFilter = buildArrayFilter(filters.caseType, 'caseType');
  if (caseTypeFilter) whereConditions.push(caseTypeFilter);

  // Status filter: pass values directly (frontend sends raw values from the statuslist table,
  // e.g. 'Open', 'Closed', 'Pending', 'Stayed' — matches PHP's WHERE status IN (...) behaviour)
  const statusFilter = buildArrayFilter(filters.status, 'status');
  if (statusFilter) whereConditions.push(statusFilter);

  const hearingDateFilter = buildDateRangeFilter(filters.hearingDateFrom, filters.hearingDateTo, 'hearingDate');
  if (hearingDateFilter) whereConditions.push(hearingDateFilter);

  const dateReceivedFilter = buildDateRangeFilter(filters.dateReceivedFrom, filters.dateReceivedTo, 'dateReceivedByOSAH');
  if (dateReceivedFilter) whereConditions.push(dateReceivedFilter);

  const judgeFilter = buildArrayFilter(filters.judge, 'judge');
  if (judgeFilter) whereConditions.push(judgeFilter);

  const judgeAssistantFilter = buildArrayFilter(filters.judgeAssistant, 'judgeAssistant');
  if (judgeAssistantFilter) whereConditions.push(judgeAssistantFilter);

  const staffAttorneyFilter = buildArrayFilter(filters.staffAttorney, 'staffAttorney');
  if (staffAttorneyFilter) whereConditions.push(staffAttorneyFilter);

  return whereConditions;
}

/**
 * Build include array for joins (Clerk, Opened By, Closed By filters)
 * 
 * @param {Object} filters - Filter object with 14 filters
 * @returns {Array} Array of include objects for Sequelize
 */
export function buildIncludeArray(filters) {
  const include = [];

  const hasClerk = Array.isArray(filters.clerk) && filters.clerk.length;
  const hasOpenedBy = Array.isArray(filters.openedBy) && filters.openedBy.length;
  const hasClosedBy = Array.isArray(filters.closedBy) && filters.closedBy.length;

  if (hasClerk || hasOpenedBy || hasClosedBy) {
    const docWhereConditions = [];

    if (hasClerk) {
      docWhereConditions.push({
        [Op.and]: [
          { userId: { [Op.in]: filters.clerk } },
          // Include both 're_opened' (Node.js convention) and 're-opened' (legacy PHP convention)
          { docketStatus: { [Op.in]: ['open', 're_opened', 're-opened'] } }
        ]
      });
    }

    if (hasOpenedBy) {
      docWhereConditions.push({
        [Op.and]: [
          { userId: { [Op.in]: filters.openedBy } },
          // Include both 're_opened' (Node.js convention) and 're-opened' (legacy PHP convention)
          { docketStatus: { [Op.in]: ['open', 're_opened', 're-opened'] } }
        ]
      });
    }

    if (hasClosedBy) {
      docWhereConditions.push({
        [Op.and]: [
          { userId: { [Op.in]: filters.closedBy } },
          { docketStatus: 'closed' }
        ]
      });
    }

    include.push({
      model: DocketOpenCloseDetails,
      as: 'doc_count',
      required: true, // INNER JOIN (matches PHP behavior)
      attributes: [],
      where: docWhereConditions.length > 1
        ? { [Op.or]: docWhereConditions }
        : docWhereConditions[0]
    });
  }

  return include;
}

