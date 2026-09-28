import { Op, literal } from 'sequelize';
import { mysqlSequelize } from '../../connections/seqDB.js';
import { buildArrayCondition } from './dashboardQueryBuilder.js';

/**
 * Where-clause builders for the DDS Docket Search results
 * (POST /dashboard/searchResult), querying form1_docket directly — the
 * same table the "Form 1" review screen's searchdocketinfo API reads from,
 * so every search result resolves to a real form1_id (ports
 * DdsController::searchResultddsAction()'s master_condition).
 */

const modelAlias = 'Form1Docket';

// DATE_FORMAT avoids timezone/precision surprises comparing a DATETIME
// column against a plain YYYY-MM-DD boundary (same approach as
// dashboardQueryBuilder.js's buildDateRangeCondition).
const buildDdsDateRangeCondition = (field, fromDate, toDate) => {
  const conditions = [];
  if (fromDate) {
    conditions.push(
      literal(
        `DATE_FORMAT(\`${modelAlias}\`.\`${field}\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(fromDate)}`,
      ),
    );
  }
  if (toDate) {
    conditions.push(
      literal(
        `DATE_FORMAT(\`${modelAlias}\`.\`${field}\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(toDate)}`,
      ),
    );
  }
  return conditions;
};

/**
 * form1_docket.status holds DDS's raw status codes (pending/submitted/
 * resubmitted/approved/rejected/cloned — see ddsstatuslist), not display
 * labels. Default/no filter hides 'cloned' rows (internal clone artifacts,
 * never a real search target) same as the legacy master_condition; 'All'
 * removes every status restriction; 'resubmitted' also matches 'submitted'
 * (ddsstatuslist's "In Review" covers both).
 */
export const buildDdsStatusCondition = (status) => {
  if (!status || status === '' || status === 'NA') {
    return { status: { [Op.ne]: 'cloned' } };
  }
  if (status.toUpperCase() === 'ALL') {
    return null;
  }
  if (status.toLowerCase() === 'resubmitted') {
    return { status: { [Op.in]: ['resubmitted', 'submitted'] } };
  }
  return { status };
};

export const buildDdsGeneralSearchConditions = (condition) => {
  const whereConditions = [];

  if (condition.agencyRefNumber) {
    whereConditions.push({ agencyRefNumber: condition.agencyRefNumber });
  }

  if (condition.county) {
    const countyCondition = buildArrayCondition('county', condition.county);
    if (countyCondition) whereConditions.push(countyCondition);
  }

  const statusCondition = buildDdsStatusCondition(condition.status);
  if (statusCondition) whereConditions.push(statusCondition);

  if (condition.refAgency) {
    const refAgencyCondition = buildArrayCondition('refAgency', condition.refAgency);
    if (refAgencyCondition) whereConditions.push(refAgencyCondition);
  }

  if (condition.caseType) {
    const caseTypeCondition = buildArrayCondition('caseType', condition.caseType);
    if (caseTypeCondition) whereConditions.push(caseTypeCondition);
  }

  if (condition.judge) whereConditions.push({ judge: condition.judge });
  if (condition.judgeAssistant) whereConditions.push({ judgeAssistant: condition.judgeAssistant });
  if (condition.hearingSite) whereConditions.push({ hearingSite: condition.hearingSite });
  if (condition.hearingType) whereConditions.push({ hearingMode: condition.hearingType });

  if (condition.hearingDateFrom || condition.hearingDateTo) {
    whereConditions.push(
      ...buildDdsDateRangeCondition('hearingdate', condition.hearingDateFrom, condition.hearingDateTo),
    );
  }

  if (condition.dateReceivedByOSAHFrom || condition.dateReceivedByOSAHTo) {
    whereConditions.push(
      ...buildDdsDateRangeCondition(
        'datereceivedbyOSAH',
        condition.dateReceivedByOSAHFrom,
        condition.dateReceivedByOSAHTo,
      ),
    );
  }

  return whereConditions;
};
