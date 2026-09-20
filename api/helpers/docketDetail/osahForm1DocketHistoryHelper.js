import { insertDocketHistory } from '../osahForm1Helper.js';
import { notifyUserIfHearingInfoUpdated } from './osahForm1NotifyHelper.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-05-27
  Description : Docket history and ePortal notification helpers extracted from
                osahForm1Service.js to keep file sizes under 300 lines.
                Mirrors PHP docketHistory() + notifyUsers() in OsahformController.php.
*/

const HISTORY_LABEL_MAP = {
  agencyRefNumber: 'Agency Reference Number',
  refAgency: 'Agency Code',
  caseType: 'Case Type',
  caseFileType: 'Case File Type',
  county: 'County',
  status: 'Status',
  dateRequested: 'Date Requested',
  dateReceivedByOSAH: 'Date Received by OSAH',
  hearingMode: 'Hearing Mode',
  hearingSite: 'Location',
  hearingDate: 'Hearing Date',
  hearingTime: 'Hearing Time',
  judge: 'Judge',
  judgeAssistant: 'Judge Assistant',
  staffAttorney: 'Staff Attorney',
  docketClerk: 'Docket Clerk',
  caseName: 'Case Name',
  tempPermits: 'Temp Permits',
  telvOFive: '1205',
};

const DATE_FIELDS = new Set(['hearingDate', 'dateRequested', 'dateReceivedByOSAH']);
const TIME_FIELDS = new Set(['hearingTime']);

// Fields whose changes trigger an ePortal email notification (mirrors PHP $docket_trigger)
const DOCKET_TRIGGER_FIELDS = new Set(['hearingTime', 'hearingDate', 'judge', 'judgeAssistant', 'hearingSite']);

// MySQL zero-date ('0000-00-00', or '0000-00-00 00:00:00' for datetime columns) means "no
// date set" throughout this codebase — never a real date. Treat it the same as null/empty
// so it never gets echoed as literal '0000-00-00' text (e.g. in the History tab).
function isZeroDate(value) {
  return String(value).startsWith('0000-00-00');
}

function formatHistoryDate(value) {
  if (!value || isZeroDate(value)) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function formatHistoryTime(value) {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return String(value);
  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
}

function normalizeForComparison(field, value) {
  if (value === null || value === undefined || value === '') return '';
  if (DATE_FIELDS.has(field)) {
    if (isZeroDate(value)) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function getChangedTriggerFields(existingDocket, updateFields) {
  const changed = [];
  for (const field of DOCKET_TRIGGER_FIELDS) {
    if (!(field in updateFields)) continue;
    if (normalizeForComparison(field, updateFields[field]) !== normalizeForComparison(field, existingDocket[field])) {
      changed.push(field);
    }
  }
  return changed;
}

function buildDocketHistoryMessage(existingDocket, updateFields) {
  const changedFields = [];

  for (const field of Object.keys(updateFields)) {
    if (field === 'hearingTimeId' || !(field in HISTORY_LABEL_MAP)) continue;

    const newRaw = updateFields[field];
    const oldRaw = existingDocket[field];

    if (normalizeForComparison(field, newRaw) === normalizeForComparison(field, oldRaw)) continue;

    const label = HISTORY_LABEL_MAP[field];
    let newDisplay = newRaw ?? '';
    let oldDisplay = oldRaw ?? '';

    if (DATE_FIELDS.has(field)) {
      newDisplay = formatHistoryDate(newRaw);
      oldDisplay = formatHistoryDate(oldRaw);
    } else if (TIME_FIELDS.has(field)) {
      newDisplay = formatHistoryTime(newRaw);
      oldDisplay = formatHistoryTime(oldRaw);
    }

    changedFields.push({ label, newDisplay, oldDisplay });
  }

  if (changedFields.length === 0) return '';

  const newValHtml = changedFields.map(({ label, newDisplay }) =>
    `<p><span class="history-label">${label}:</span><span class="history-data">${newDisplay}</span></p>`
  ).join('');

  const oldValHtml = changedFields.map(({ label, oldDisplay }) =>
    `<p><span class="history-label">${label}:</span><span class="history-data">${oldDisplay}</span></p>`
  ).join('');

  return `<p class="history-title">Osah form has been updated with the following data :</p>${newValHtml}`
    + `<br><p class="history-title"><strong>Previous Entry: </strong></p>${oldValHtml}`;
}

// Mirrors PHP docketHistory() — builds and inserts the field-change history entry,
// then notifies ePortal parties if any of the 5 trigger fields changed.
// Called from updateDocket() after the DB transaction commits, exactly as PHP calls
// docketHistory() from updatedocketAction() after all DB writes complete.
export async function recordDocketHistory(caseId, existingDocket, updateFields, { isReopenSave, reopenHearingInfo, modifiedBy }) {
  const historyMessage = buildDocketHistoryMessage(existingDocket, updateFields);

  // Mirrors PHP: $reopenInfo is prepended to $historyData.$historyDataPre and written as ONE
  // row, only when there are changed fields to report (legacy's `if($count > 0)` gate) — a
  // reopen with no other field changes never gets its own history row.
  if (historyMessage) {
    const combinedMessage = isReopenSave && reopenHearingInfo
      ? `${reopenHearingInfo}${historyMessage}`
      : historyMessage;
    await insertDocketHistory(caseId, combinedMessage, modifiedBy);
  }

  // Mirrors PHP docketHistory(): notifyUsers() called after addHistory() when trigger fields changed.
  const changedTriggerFields = getChangedTriggerFields(existingDocket, updateFields);
  if (changedTriggerFields.length > 0) {
    await notifyUserIfHearingInfoUpdated(caseId, changedTriggerFields);
  }
}
