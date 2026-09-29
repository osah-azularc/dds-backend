import { Op } from 'sequelize';
import Form1Docket from '../models/Form1Docket.js';
import Form1Parties from '../models/Form1Parties.js';
import DdsStatusList from '../models/DdsStatusList.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Search helpers for the DDS Docket Search results (POST /dashboard/searchResult).
 * Ports DdsController::searchResultddsAction()'s three query branches, but
 * against a single form1_parties table (typeOfContact + firstName/lastName
 * all live on the same row — unlike eCourt's split across PeopleDetails/
 * AgencyCaseworkerByCase/AttorneyByCase/MinorDetails), so name and
 * contact-type filters both reduce to the same "collect matching form1Ids,
 * then filter Form1Docket by them" shape.
 */

// Matches the field list of legacy's DdsController::searchResultddsAction()
// SELECT (docketnumber/ecourtCaseid included even though DDS's own React grid
// doesn't render every one of these yet -- see SearchResultsColumns.jsx --
// so this response stays a faithful port of the legacy contract rather than
// only what today's UI happens to consume).
const RESPONSE_ATTRIBUTES = [
  'form1Id', 'ecourtCaseid', 'docketNumber', 'docketClerk', 'hearingReqBy',
  'caseName', 'refAgency', 'caseType', 'caseFileType',
  'dateReceivedByOSAH', 'dateRequested', 'hearingDate', 'hearingTime',
  'county', 'hearingSite', 'hearingMode', 'judge', 'judgeAssistant',
  'hearingRequestedDate', 'others', 'docketCreatedDate',
  'status', 'agencyRefNumber',
];

const buildQueryOptions = (additionalCondition, whereConditions) => {
  const orderField = additionalCondition.orderby || 'dateReceivedByOSAH';
  const orderDirection = additionalCondition.order === 1 ? 'DESC' : 'ASC';

  return {
    attributes: RESPONSE_ATTRIBUTES,
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    order: [[orderField, orderDirection]],
    limit: additionalCondition.length || 50,
    offset: additionalCondition.start || 0,
  };
};

/** Resolves each row's raw status code to its ddsstatuslist display name. */
const applyStatusDisplayNames = async (rows) => {
  const statusRows = await DdsStatusList.findAll({ raw: true });
  const displayNameByStatus = new Map(statusRows.map((row) => [row.status, row.displayName]));

  return rows.map((row) => {
    const json = row.toJSON();
    return { ...json, status: displayNameByStatus.get(json.status) ?? json.status };
  });
};

const emptyResult = (res) => res.status(200).json({
  success: true,
  message: 'No results found',
  data: [],
  total: 0,
  error: null,
});

/**
 * Runs the plain (no name/contact-type filter) branch of the search.
 */
export async function runDdsGeneralSearch(whereConditions, additionalCondition, res) {
  const { count, rows } = await Form1Docket.findAndCountAll(buildQueryOptions(additionalCondition, whereConditions));

  return res.status(200).json({
    success: true,
    message: count > 0 ? 'Data fetched successfully' : 'No results found',
    data: await applyStatusDisplayNames(rows),
    total: count,
    error: null,
  });
}

/**
 * Runs the name/contact-type search branch: collects the distinct form1Ids
 * of form1_parties rows matching the given filters, then filters
 * Form1Docket down to those ids.
 */
export async function handleDdsComplexSearch(additionalCondition, whereConditions, fname, lname, contactType, res) {
  try {
    const partyWhere = {};
    if (contactType) partyWhere.typeOfContact = contactType;
    if (fname) partyWhere.firstName = fname;
    if (lname) partyWhere.lastName = lname;

    const partyRows = await Form1Parties.findAll({
      attributes: ['form1Id'],
      where: partyWhere,
      raw: true,
    });
    const form1Ids = [...new Set(partyRows.map((row) => row.form1Id))];

    if (form1Ids.length === 0) {
      return emptyResult(res);
    }

    const queryOptions = buildQueryOptions(additionalCondition, [
      ...whereConditions,
      { form1Id: { [Op.in]: form1Ids } },
    ]);
    const { count, rows } = await Form1Docket.findAndCountAll(queryOptions);

    if (count === 0) {
      return emptyResult(res);
    }

    return res.status(200).json({
      success: true,
      message: 'Data fetched successfully',
      data: await applyStatusDisplayNames(rows),
      total: count,
      error: null,
    });
  } catch (error) {
    logger.error('❌ Error in handleDdsComplexSearch:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: [],
      total: 0,
      error: error.message,
    });
  }
}
