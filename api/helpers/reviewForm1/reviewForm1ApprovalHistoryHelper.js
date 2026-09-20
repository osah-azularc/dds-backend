/**
 * @module reviewForm1ApprovalHistoryHelper
 * @description Detailed docket History-tab entries written when a Form 1 is
 *              approved — split out from reviewForm1ApprovalService.js to keep
 *              new code in its own file. Mirrors legacy osah.repos
 *              Reviewform1Controller::addHistory() exactly (its 'addDocket',
 *              'approve', 'addParties' and 'addDocument' cases), which builds
 *              field-by-field HTML history entries rather than a one-line summary.
 */
import User from '../../models/User.js';
import { insertDocketHistory } from '../osahForm1Helper.js';
import { escapeHtml } from '../../utilities/htmlEscape.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Detailed docket History-tab entries written when a Form 1 is
                approved (docket creation, approval, parties added, documents added).
*/

function toMdY(value) {
  if (!value) return '';
  const isoString = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoString);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${month}-${day}-${year}`;
}

// Mirrors PHP's date('h:i A', ...) for a "HH:mm[:ss]" stored time value.
function toHourMinuteAmPm(value) {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return '';
  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// value can originate from agency-submitted Form 1 data (e.g. party.address1,
// docket.caseName) and is stored/rendered as HTML in the docket History tab —
// escape it to prevent stored XSS. label is always a hardcoded string from the
// LABELED_FIELDS lists below, never user input, so it's left as-is.
const historyRow = (label, value) => (
  label && value !== undefined && value !== null && value !== ''
    ? `<p><span class="history-label">${label}:</span><span class="history-data">${escapeHtml(value)}</span></p>`
    : ''
);

/** Mirrors Reviewform1Controller::addHistory 'addDocket' case (Reviewform1Controller.php:949-986). */
function buildDocketCreationHistory(docket) {
  const LABELED_FIELDS = [
    ['refAgency', 'Agency'],
    ['caseType', 'Case Type'],
    ['county', 'County'],
    ['dateRequested', 'Date Requested'],
    ['agencyRefNumber', 'Agency Ref Number'],
    ['hearingMode', 'Hearing Mode'],
    ['dateReceivedByOSAH', 'Datereceived by OSAH'],
    ['hearingSite', 'Hearing Site'],
    ['hearingDate', 'Hearing Date'],
    ['hearingTime', 'Hearing Time'],
    ['judge', 'Judge'],
    ['judgeAssistant', 'Judge Assistant'],
    ['docketClerk', 'Docket Clerk'],
    ['status', 'Status'],
    ['attorneyForPetitioner', 'Attorney For Petitioner'],
    ['staffAttorney', 'Staff Attorney'],
    ['docketCreatedDate', 'Docket Created Date'],
  ];
  const DATE_FIELDS = new Set(['dateRequested', 'hearingDate', 'dateReceivedByOSAH', 'docketCreatedDate']);
  const rows = LABELED_FIELDS.map(([key, label]) => {
    const rawValue = docket[key];
    let value;
    if (DATE_FIELDS.has(key)) {
      value = toMdY(rawValue);
    } else if (key === 'hearingTime') {
      value = toHourMinuteAmPm(rawValue);
    } else {
      value = rawValue;
    }
    return historyRow(label, value);
  }).join('');
  return `<p class="history-title">OSAH form has been created and saved with the following data:</p>${rows}`;
}

/** Mirrors Reviewform1Controller::addHistory 'approve' case (Reviewform1Controller.php:987-989). */
function buildApprovalHistory(docketClerk, agencyUserEmail) {
  const now = new Date();
  return `<p class="history-title">The Form 1 was approved with the following:</p>`
    + historyRow('Date Approved', toMdY(now.toISOString()))
    + historyRow('Time Approved', toHourMinuteAmPm(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`))
    + historyRow('eCourt User Who Approved Form 1', docketClerk)
    + historyRow('Agency User Who Submitted Form 1', agencyUserEmail);
}

/** Mirrors Reviewform1Controller::addHistory 'addParties' case (Reviewform1Controller.php:990-1010). */
function buildPartyHistory(docketId, party) {
  const LABELED_FIELDS = [
    ['typeOfContact', 'Contact Type'],
    ['lastName', 'Lastname'],
    ['firstName', 'Firstname'],
    ['middleName', 'Middlename'],
    ['address1', 'Address1'],
    ['address2', 'Address2'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip', 'Zip'],
    ['phone', 'Phone'],
    ['email', 'Email'],
    ['fax', 'Fax'],
    ['isInternationalAddr', 'Is International Addr'],
    ['internationalAddress', 'International Address'],
    ['title', 'Title'],
    ['company', 'Company'],
    ['attorneyBar', 'AttorneyBar'],
  ];
  const rows = LABELED_FIELDS.map(([key, label]) => historyRow(label, party[key])).join('');
  return `<p class="history-title">Party has been added with following:</p>${historyRow('Docket Number', docketId)}${rows}`;
}

/** Mirrors Reviewform1Controller::addHistory 'addDocument' case (Reviewform1Controller.php:1011-1013). */
function buildDocumentHistory(fileName, documentType, dateFiled) {
  return `<p class="history-title">A file has been added:</p>`
    + historyRow('File Attachment Name', fileName)
    + historyRow('Document Type', documentType)
    + historyRow('Date Filed', toMdY(dateFiled));
}

/**
 * Writes one detailed history entry per legacy addHistory() call
 * (Reviewform1Controller.php:713-714,780,837).
 * @param {object} docket - docket fields as inserted (docketCreatePayload) plus agencyCreatedBy
 * @param {number} docketId
 * @param {number} form1Id - unused directly but kept for call-site clarity/future use
 * @param {string} userName
 * @param {object[]} addedParties - Form1Parties rows copied to the docket
 * @param {string[]} addedDocuments - document names copied to the docket
 */
export async function writeApprovalHistory(docket, docketId, form1Id, userName, addedParties, addedDocuments) {
  // Independent inserts/lookups run in parallel instead of one-by-one — this
  const [agencyUser] = await Promise.all([
    docket.agencyCreatedBy
      ? User.findOne({ where: { userId: docket.agencyCreatedBy }, attributes: ['email'] })
      : Promise.resolve(null),
    insertDocketHistory(docketId, buildDocketCreationHistory(docket), userName),
  ]);
  const agencyUserEmail = agencyUser?.email ? String(agencyUser.email).split('@')[0] : '';

  await Promise.all([
    insertDocketHistory(docketId, buildApprovalHistory(docket.docketClerk, agencyUserEmail), userName),
    ...addedParties.map((party) => insertDocketHistory(docketId, buildPartyHistory(docketId, party), userName)),
    ...addedDocuments.map((documentName) => insertDocketHistory(
      docketId,
      buildDocumentHistory(documentName, 'OSAHForm1 - initial docs', new Date().toISOString()),
      userName,
    )),
  ]);
}
