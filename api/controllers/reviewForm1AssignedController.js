/**
 * @module reviewForm1AssignedController
 * @description Assigned Form 1s list endpoint — split out from
 *              reviewForm1Controller.js to keep files under the ~300-line
 *              convention.
 */

import Form1Docket from '../models/Form1Docket.js';
import { logger } from '../../config/winstonLogger.js';
import {
  arrayOrStringHasValue,
  resolveRequestedClerk,
  applyClerkFilter,
  applyAgencyFilter,
  applyCaseTypeFilter,
  applyStatusFilter,
  applyDateFilter,
  buildSearchWhere,
} from '../helpers/reviewForm1/reviewForm1AssignedFilterHelper.js';
import { parsePagination } from '../helpers/reviewForm1/paginationHelper.js';

/** Get assigned Form 1s with filtering. Assigned = Form 1s with a docketclerk assigned. */
export const getAssignedForm1s = async (req, res) => {
  try {
    const {
      clerk: requestedClerk = '',
      agency = '',
      caseType = '',
      status = '',
      dateReceived = '',
      dateReceivedFrom = '',
      dateReceivedTo = '',
      searchValue = '',
      limit = 50,
      offset = 0,
      orderby = 'agencyrefnumber',
      ascdesc = 'ASC',
    } = req.body;

    const clerk = resolveRequestedClerk(req, requestedClerk);

    const hasAnyFilters =
      arrayOrStringHasValue(clerk) ||
      arrayOrStringHasValue(agency) ||
      arrayOrStringHasValue(caseType) ||
      arrayOrStringHasValue(status) ||
      !!dateReceived ||
      !!dateReceivedFrom ||
      !!dateReceivedTo;
    const hasExplicitStatusFilter = arrayOrStringHasValue(status);

    const whereConditions = { isFileScanned: '1' };
    applyClerkFilter(whereConditions, clerk, hasAnyFilters);
    applyAgencyFilter(whereConditions, agency);
    applyCaseTypeFilter(whereConditions, caseType);
    applyStatusFilter(whereConditions, status, hasAnyFilters, hasExplicitStatusFilter);
    applyDateFilter(whereConditions, { dateReceived, dateReceivedFrom, dateReceivedTo }, hasAnyFilters);

    const where = buildSearchWhere(whereConditions, searchValue);
    const { limit: parsedLimit, offset: parsedOffset } = parsePagination(limit, offset);

    const { count, rows } = await Form1Docket.findAndCountAll({
      where,
      limit: parsedLimit,
      offset: parsedOffset,
      order: [[orderby, ascdesc.toUpperCase()]],
      attributes: [
        'form1Id',
        'docketClerk',
        'refAgency',
        'caseType',
        'status',
        'dateReceivedByOSAH',
        'agencyRefNumber',
        'docketNumber',
        'caseName',
      ],
    });

    return res.status(200).json({
      success: true,
      data: rows,
      count,
      page: Math.floor(parsedOffset / parsedLimit) + 1,
    });
  } catch (error) {
    logger.error('[ReviewForm1] getAssignedForm1s error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned Form 1s',
      error: error.message,
    });
  }
};
