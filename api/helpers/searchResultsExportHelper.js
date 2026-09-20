import { Op } from 'sequelize';
import { buildGeneralSearchConditions, buildClosedCasesSearchConditions, applyDocumentFilters } from './dashboardQueryBuilder.js';
import { escapeCsvValue } from '../utilities/csvEscape.js';
import TypeOfContact from '../models/TypeOfContact.js';
import PeopleDetails from '../models/PeopleDetails.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../models/AttorneyByCase.js';
import MinorDetails from '../models/MinorDetails.js';
import Docket from '../models/Docket.js';
import DocketDisposition from '../models/DocketDisposition.js';

const TABLE_MODEL_MAP = {
  peopledetails: PeopleDetails,
  agencycaseworkerbycase: AgencyCaseworkerByCase,
  attorneybycase: AttorneyByCase,
  minordetails: MinorDetails,
};

/**
 * Collect unique caseIds matching fname/lname/contactType search.
 * Mirrors dashboardHelper.js collectCaseIdsByNameOnly + resolveDetailModelAndWhere.
 * Returns null if contactType is invalid; returns [] if no matches.
 */
async function collectNameSearchCaseIds(fname, lname, contactType) {
  if (!contactType) {
    const nameWhere = {};
    if (fname) nameWhere.firstName = fname;
    if (lname) nameWhere.lastName = lname;

    const [peopleRows, agencyRows, attorneyRows, minorRows] = await Promise.all([
      PeopleDetails.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
      AgencyCaseworkerByCase.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
      AttorneyByCase.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
      MinorDetails.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
    ]);

    const allRows = [...peopleRows, ...agencyRows, ...attorneyRows, ...minorRows];
    return [...new Set(allRows.map((r) => r.caseId).filter((id) => id != null))];
  }

  const contactTypeRecord = await TypeOfContact.findOne({ where: { partyContact: contactType } });
  if (!contactTypeRecord) return null;

  const DetailModel = TABLE_MODEL_MAP[contactTypeRecord.tableName] || PeopleDetails;
  const detailWhere = {};
  if (contactType !== 'Minor/children') detailWhere.typeOfContact = contactType;
  if (fname) detailWhere.firstName = fname;
  if (lname) detailWhere.lastName = lname;

  const rows = await DetailModel.findAll({ attributes: ['caseId'], where: detailWhere, raw: true });
  return [...new Set(rows.map((r) => r.caseId).filter((id) => id != null))];
}

// Reduced from 999,999 to prevent resource exhaustion and DoS attacks
const MAX_EXPORT_LIMIT = 10000;

/**
 * Format "LastName, FirstName" from a model row. Returns null if both are empty.
 */
function formatName(row) {
  const last = (row.lastName || '').trim();
  const first = (row.firstName || '').trim();
  if (!last && !first) return null;
  return first ? `${last}, ${first}` : last;
}

/**
 * Export search results as CSV
 * @param {Object} condition - Search condition object
 * @param {Object} additionalCondition - Additional condition (sorting)
 * @param {String} searchType - Search type ('general' or 'closed')
 * @param {Boolean} [fromUpcomingCalendar] - When true, export the reduced Calendar-print column
 *   set (mirrors the calendarPdf.ejs Calendar print table) instead of the full column set.
 * @returns {Promise<String>} - CSV data
 */
export const exportSearchResults = async (
  condition,
  additionalCondition = {},
  searchType = 'general',
  fromUpcomingCalendar = false,
) => {
  // Build where conditions based on search type
    let whereConditions;
    if (searchType === 'closed') {
      whereConditions = buildClosedCasesSearchConditions(condition);
    } else {
      whereConditions = buildGeneralSearchConditions(condition);
    }

    // Apply document filters (withDecisionDocument, excludeNOH, withoutNOH) — same as generalSearch
    const earlyExit = await applyDocumentFilters(whereConditions, condition);
    if (earlyExit) return null;

    // Apply name/contact type search — same as generalSearch handleComplexSearch path
    const fname = condition.firstName;
    const lname = condition.lastName;
    const contactType = condition.typeOfContact;
    if (fname || lname || contactType) {
      const caseIds = await collectNameSearchCaseIds(fname, lname, contactType);
      if (!caseIds || caseIds.length === 0) return null;
      whereConditions.push({ caseId: { [Op.in]: caseIds } });
    }

  // Query 1 — fetch matching dockets (final sort below mirrors PHP's usort($export_arr, casename),
  // which runs after caseName normalization and overrides any SQL order)
  const dockets = await Docket.findAll({
    attributes: [
      'caseId', 'caseName', 'refAgency', 'caseType', 'judge',
      'dateRequested', 'dateReceivedByOSAH', 'hearingDate', 'hearingTime',
      'hearingSite', 'county', 'status', 'agencyRefNumber', 'judgeAssistant',
      'uniqueCode',
    ],
    where: { [Op.and]: whereConditions },
    limit: MAX_EXPORT_LIMIT,
    raw: true,
  });

  if (!dockets || dockets.length === 0) return null;

  if (dockets.length >= MAX_EXPORT_LIMIT) {
    throw new Error(
      `Export limit exceeded. Maximum ${MAX_EXPORT_LIMIT} records allowed. ` +
      `Please refine your search criteria or contact support for bulk exports.`
    );
  }

  const caseIds = dockets.map((d) => d.caseId);

  // Queries 2-5 — batch-fetch all related data in parallel (no N+1)
  const [petitioners, attorneys, caseOfficials, dispositions] = await Promise.all([
    PeopleDetails.findAll({
      attributes: ['caseId', 'lastName', 'firstName'],
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: 'Petitioner' },
      raw: true,
    }),
    AttorneyByCase.findAll({
      attributes: ['caseId', 'lastName', 'firstName'],
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: 'Petitioner Attorney' },
      raw: true,
    }),
    AgencyCaseworkerByCase.findAll({
      attributes: ['caseId', 'lastName', 'firstName', 'typeOfContact'],
      where: { caseId: { [Op.in]: caseIds } },
      order: [['sno', 'ASC']],
      raw: true,
    }),
    DocketDisposition.findAll({
      attributes: ['caseId', 'dispositionCode', 'dispositionDate'],
      where: { caseId: { [Op.in]: caseIds } },
      raw: true,
    }),
  ]);

  // Build O(1) lookup maps — legacy PHP only ever shows a single Petitioner / Case Official
  // per docket (the first matching row), never a joined list of every contact on the case.
  const petitionerMap = {};
  for (const r of petitioners) {
    if (petitionerMap[r.caseId]) continue;
    const name = formatName(r);
    if (name) petitionerMap[r.caseId] = name;
  }

  const attorneyMap = {};
  for (const r of attorneys) {
    if (attorneyMap[r.caseId]) continue;
    const name = formatName(r);
    if (name) attorneyMap[r.caseId] = name;
  }

  // Group case officials by caseId (order preserved) so the per-row casetype switch below
  // can pick the right contact, mirroring legacy PHP exportdataAction's switch($casetype).
  const officialsByCase = {};
  for (const r of caseOfficials) {
    if (!officialsByCase[r.caseId]) officialsByCase[r.caseId] = [];
    officialsByCase[r.caseId].push(r);
  }

  /**
   * Pick the single Case Official for a docket row, mirroring legacy PHP:
   * ALS -> 'officer', CSS -> 'Case Worker', OIG -> 'Investigator', else -> first contact found.
   */
  function pickCaseOfficial(caseId, caseType) {
    const officials = officialsByCase[caseId];
    if (!officials || officials.length === 0) return null;

    // Case-insensitive: legacy's SQL "typeofcontact = '...'" matches under MySQL's default
    // collation regardless of stored casing/whitespace; a JS === here would miss those rows.
    const findByType = (type) => officials.find(
      (o) => String(o.typeOfContact || '').trim().toLowerCase() === type.toLowerCase(),
    );

    let match;
    if (caseType === 'ALS') {
      match = findByType('officer');
    } else if (caseType === 'CSS') {
      match = findByType('Case Worker');
    } else if (caseType === 'OIG') {
      match = findByType('Investigator');
    } else {
      match = officials[0];
    }
    return match ? formatName(match) : null;
  }

  // Pick the latest disposition per caseId (mirrors PHP MAX(dispositiondate) subquery)
  const dispositionMap = {};
  for (const r of dispositions) {
    const existing = dispositionMap[r.caseId];
    if (!existing || new Date(r.dispositionDate) > new Date(existing.dispositionDate)) {
      dispositionMap[r.caseId] = r;
    }
  }

  // Define CSV headers. The "from upcoming calendar" view exports the reduced column set used
  // by the Calendar print PDF (calendarPdf.ejs) instead of the full column set below.
  const headers = fromUpcomingCalendar
    ? [
        'S.No',
        'Docket Number',
        'Petitioner / Respondent',
        'Petitioner Attorney',
        'Case Desc',
        'Case Official',
        'Hearing Site',
        'County',
        'Hearing Time',
        'Agency Ref #',
        'Assistant',
        'Notes',
      ]
    : [
        'Docket',
        'Case Name',
        'Agency',
        'Case Type',
        'Judge',
        'Date Requested',
        'Date Received',
        'Hearing Date',
        'Hearing Time',
        'Hearing Location',
        'County',
        'Status',
        'Agency Reference Number',
        'Petitioner Attorney',
        'Petitioner',
        'Case Official',
        'Judge Assistant',
        'Disposition Outcome',
        'Disposition Date',
        'ePortal Code',
      ];

  // Mirrors PHP's final usort($export_arr, strcmp-by-casename): case-sensitive, and applied
  // to the normalized display name (placeholder rows sort as "No party Added", under "N"),
  // not the raw DB value — this fully overrides any earlier SQL order, same as in PHP.
  dockets.sort((a, b) => {
    const nameA = normalizeCaseName(a.caseName);
    const nameB = normalizeCaseName(b.caseName);
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  const csvRows = [headers.join(',')];

  for (const [index, row] of dockets.entries()) {
    const disposition = dispositionMap[row.caseId] || null;

    const dateReceived = row.dateReceivedByOSAH ? formatDateForCSV(row.dateReceivedByOSAH) : '';
    const dateRequested = row.dateRequested ? formatDateForCSV(row.dateRequested) : '';
    const hearingDate = row.hearingDate ? formatDateForCSV(row.hearingDate) : '';
    const dispositionDate = disposition?.dispositionDate ? formatDateForCSV(disposition.dispositionDate) : '';
    const caseName = normalizeCaseName(row.caseName);

    const petitioner = petitionerMap[row.caseId] || '...';
    const attorney = attorneyMap[row.caseId] || '...';
    const official = pickCaseOfficial(row.caseId, row.caseType) || '...';

    if (fromUpcomingCalendar) {
      // Reduced Calendar-print column set — mirrors calendarPdf.ejs / calendarRepository.js's
      // row shape (Petitioner/Respondent = casename, Case Desc = casetype, Assistant =
      // judgeassistant, Notes left blank for handwritten notes on the printed calendar).
      const values = [
        escapeCsvValue(index + 1),
        escapeCsvValue(row.caseId || ''),
        escapeCsvValue(caseName),
        escapeCsvValue(attorney === '...' ? '' : attorney),
        escapeCsvValue(row.caseType || ''),
        escapeCsvValue(official === '...' ? '' : official),
        escapeCsvValue(row.hearingSite || ''),
        escapeCsvValue(row.county || ''),
        escapeCsvValue(formatHearingTimeForCSV(row.hearingTime)),
        escapeCsvValue(row.agencyRefNumber || ''),
        escapeCsvValue(row.judgeAssistant || ''),
        escapeCsvValue(''),
      ];
      csvRows.push(values.join(','));
      continue;
    }

    const values = [
      escapeCsvValue(row.caseId || ''),
      escapeCsvValue(caseName),
      escapeCsvValue(row.refAgency || ''),
      escapeCsvValue(row.caseType || ''),
      escapeCsvValue(row.judge || ''),
      escapeCsvValue(dateRequested),
      escapeCsvValue(dateReceived),
      escapeCsvValue(hearingDate),
      escapeCsvValue(formatHearingTimeForCSV(row.hearingTime)),
      escapeCsvValue(row.hearingSite || ''),
      escapeCsvValue(row.county || ''),
      escapeCsvValue(row.status || ''),
      escapeCsvValue(row.agencyRefNumber || ''),
      escapeCsvValue(attorney),
      escapeCsvValue(petitioner),
      escapeCsvValue(official),
      escapeCsvValue(row.judgeAssistant || ''),
      escapeCsvValue(disposition?.dispositionCode || '...'),
      escapeCsvValue(dispositionDate || '...'),
      escapeCsvValue(row.uniqueCode || ''),
    ];

    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
};

/**
 * Format date for CSV export
 * @param {Date|String} dateValue - Date value
 * @returns {String} - Formatted date (MM-DD-YYYY)
 */
function formatDateForCSV(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Format a DB time string (e.g. "09:00:00") as 12-hour AM/PM with a zero-padded hour,
 * matching the legacy PHP export's TIME_FORMAT(doc.hearingtime, '%h:%i %p').
 */
function formatHearingTimeForCSV(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed === '0') return '';
  if (!trimmed.includes(':')) return trimmed;
  const [h, m] = trimmed.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return trimmed;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Normalize a raw DB caseName for display, mirroring PHP's placeholder handling
 * ('' / '(NULL)' / ',' -> "No party Added") before TRIM(doc.casename).
 */
function normalizeCaseName(raw) {
  const trimmed = (raw || '').trim();
  return (!trimmed || trimmed.toUpperCase() === '(NULL)' || trimmed === ',')
    ? 'No party Added'
    : trimmed;
}

