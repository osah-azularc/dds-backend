/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Allow-listed field-diff + sentence-template activity log writer, ported from
                PHP TimeExpenseController::updateActivityLogAction (TimeExpenseController.php
                :4131-4228). Called from every mutating time-entry service (edit/submit/
                approve/reject) -- never from plain create/duplicate, matching legacy.
*/
import { fn, col } from 'sequelize';
import moment from 'moment';
import TimeEntryActivityLog from '../../../models/timeexpense/timeentry/TimeEntryActivityLog.js';
import JudgeAssistantClerk from '../../../models/JudgeAssistantClerk.js';
import { safeParseArray } from '../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';

const FIELD_LABELS = {
  agencyWorkType: 'BILLED AGENCY',
  timeTrackingDateEntry: 'DATE',
  originalWorkingTime: 'DURATION',
  roundedUpTime: 'ROUNDED DURATION',
  description: 'DESCRIPTION',
};

/**
 * Builds the allow-listed, renamed diff between the entry's prior values and its new ones --
 * matches legacy's updateActivityLogAction (TimeExpenseController.php:4148-4187), including
 * its DATE-only reformat (date("m-d-Y", strtotime($value))). agencyWorkType is stored as a
 * JSON-encoded string (see timeEntryCrudService.js) -- legacy diffs and stores that raw
 * string as-is too, but dumping it unparsed produced a double-encoded, bracket-and-quote
 * mess once the whole log entry got JSON.stringify'd again; parsed into a plain list here
 * instead.
 */
function buildModifiedContent(previous, next) {
  const changed = {};
  Object.entries(FIELD_LABELS).forEach(([field, label]) => {
    const before = previous?.[field];
    const after = next?.[field];
    if (before === undefined || after === undefined || before === after) return;
    if (field === 'timeTrackingDateEntry') {
      changed[label] = moment(before).format('MM-DD-YYYY');
    } else if (field === 'agencyWorkType') {
      changed[label] = safeParseArray(before).join(', ');
    } else {
      changed[label] = before;
    }
  });
  return changed;
}

/**
 * Approve never touches these fields, so there's nothing to diff -- yet legacy's own Approved
 * log entries always show the entry's DATE/ROUNDED DURATION/BILLED AGENCY/DESCRIPTION anyway.
 * That's a side effect of updateActivityLogAction's array_diff_assoc call: the data written on
 * approve only has is_submitted/updated_date, so every other field in the pre-update row reads
 * as "changed" by omission. Reproduced directly as an unconditional snapshot of the entry's own
 * current values, since trying to diff previous/next (near-identical for approve) would
 * otherwise come out empty.
 */
function buildApprovedSnapshot(entry) {
  const snapshot = {};
  if (entry?.timeTrackingDateEntry) {
    snapshot[FIELD_LABELS.timeTrackingDateEntry] = moment(entry.timeTrackingDateEntry).format('MM-DD-YYYY');
  }
  if (entry?.roundedUpTime) snapshot[FIELD_LABELS.roundedUpTime] = entry.roundedUpTime;
  const agencies = safeParseArray(entry?.agencyWorkType).join(', ');
  if (agencies) snapshot[FIELD_LABELS.agencyWorkType] = agencies;
  if (entry?.description) snapshot[FIELD_LABELS.description] = entry.description;
  return snapshot;
}

function formatActor(actor) {
  const first = actor?.firstName || '';
  const last = actor?.lastName || '';
  const initials = `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
  return { name: `${last}, ${first}`, initials };
}

/**
 * @param {object} params
 * @param {'Modified'|'Submitted'|'Approved'|'Rejected'} params.action
 * @param {number} params.timeEntryId
 * @param {object} params.previous - the entry's row values before this update
 * @param {object} params.next - the values being written
 * @param {number} params.actorId - acting user's id (created_by)
 * @param {object} params.actor - acting user's {firstName, lastName}, for the description line
 * @param {string} [params.rejectionReason]
 * @param {import('sequelize').Transaction} [params.transaction] - when the caller runs inside
 *   its own transaction (e.g. entriesService.js's bulk approve/reject), this log write must
 *   join it -- otherwise a later failure in the same batch rolls back the entry's own update
 *   but leaves this row committed, an orphaned "Approved"/"Rejected" log for an entry whose
 *   status was never actually changed.
 */
export async function writeActivityLog({
  action,
  timeEntryId,
  previous,
  next,
  actorId,
  actor,
  rejectionReason,
  transaction,
}) {
  const { name, initials } = formatActor(actor);
  const now = new Date();
  const description = `Time Entry ${action} by ${name} (${initials}) ${moment(now).format('MMM DD, YYYY')} at ${moment(now).format('hh:mm A')}`;
  const modifiedContent = action === 'Approved' ? buildApprovedSnapshot(next) : buildModifiedContent(previous, next);

  return TimeEntryActivityLog.create(
    {
      action,
      timeEntryId,
      description,
      createdBy: actorId,
      // DB-side NOW(), not a JS Date -- avoids the TZ round-trip this connection isn't safe
      // for (see getActivityLog's own comment below on reading createdAt back the same way).
      createdAt: fn('NOW'),
      rejectionReason: rejectionReason || null,
      modifiedContent: Object.keys(modifiedContent).length ? JSON.stringify(modifiedContent) : null,
    },
    { transaction },
  );
}

/**
 * Newest-first, with the acting user's name attached -- matches getTimeEntryActivityByIdAction's
 * join. formattedDateTime is computed by MySQL itself (DATE_FORMAT(created_at, '%b %d, %Y at
 * %h:%i %p'), the exact SQL legacy's own getTimeEntryActivityByIdAction uses) rather than in
 * JS, so it never touches the createdAt column as a JS Date at all -- see writeActivityLog's
 * comment on why that round-trip isn't safe on this connection.
 */
export async function getActivityLog(timeEntryId) {
  const rows = await TimeEntryActivityLog.findAll({
    where: { timeEntryId },
    attributes: {
      include: [[fn('DATE_FORMAT', col('created_at'), '%b %d, %Y at %h:%i %p'), 'formattedDateTime']],
    },
    include: [{ model: JudgeAssistantClerk, as: 'actor', attributes: ['firstName', 'lastName'] }],
    order: [['id', 'DESC']],
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    let modifiedContent = null;
    try {
      modifiedContent = plain.modifiedContent ? JSON.parse(plain.modifiedContent) : null;
    } catch {
      modifiedContent = null;
    }
    return { ...plain, modifiedContent };
  });
}
