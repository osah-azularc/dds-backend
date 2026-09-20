/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Every single-entry mutation on the day form -- add/edit/submit/duplicate/
                getById/delete plus approve/reject. Ports PHP TimeExpenseController's
                addTimeEntryAction/editTimeentryFormAction/submitTimeEntryFormAction/
                duplicateSelectedTimeEntryAction/getTimeEntryByIdAction/
                approveTimeentryFormAction/rejectTimeentryFormAction (single-id case; Review &
                Post's bulk versions live in reviewPost/entriesService.js and reuse
                assertInvoiceUnlocked/writeActivityLog from here). Decisions: #1 period lock
                keeps legacy's in-review rejected-entry bypass, never for closed, #2 editing
                resets status to draft, #3 delete is invoice-lock-checked, #4 approve is too
                (legacy has no such check), #7 duplicate always reassigns to the current user,
                #12 getById is ownership-scoped.
*/
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import JudgeAssistantClerk from '../../../../models/JudgeAssistantClerk.js';
import { computeTimeEntryDurations } from '../roundingService.js';
import { getPeriodLockForDate } from '../periodService.js';
import { writeActivityLog } from '../activityLogService.js';
import { sendTimeEntryRejectionNotification } from '../../../../helpers/notification/teNotificationHelper.js';
import { IS_SUBMITTED } from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';

// "Admin" throughout Time & Expense means billing admin -- is_active_billing, not is_admin.
function isPrivileged(user) {
  return user.isActiveBilling === '1';
}

/**
 * Throws a {status, message} error the controller maps to a 400. `allowRejectedBypass`
 * matches legacy's in-review exemption: editing/submitting/duplicating a currently-Rejected
 * entry is still allowed in an in-review period, never in a closed one, never for a new entry.
 */
async function assertNotLocked(date, user, { allowRejectedBypass = false } = {}) {
  if (isPrivileged(user)) return;

  const lock = await getPeriodLockForDate(date);
  if (!lock.locked) return;
  if (lock.reason === 'in-review' && allowRejectedBypass) return;

  let message = 'The date period entered is in review, entry cannot be saved.';
  if (lock.reason === 'closed') message = 'The date period entered is closed, entry cannot be saved.';
  if (lock.reason === 'no-period') message = 'No time entry period is configured for this date; entry cannot be saved.';
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function assertInvoiceUnlocked(entry, action) {
  if (entry.addedToInvoice === '1') {
    const error = new Error(`This entry has been invoiced and can no longer be ${action}.`);
    error.status = 400;
    throw error;
  }
}

function buildEntryFields(formData) {
  const agencyCount = Array.isArray(formData.agency) ? formData.agency.length : 1;
  const durations = computeTimeEntryDurations({
    hours: formData.hours,
    minutes: formData.minutes,
    agencyCount,
  });

  return {
    task: String(formData.task),
    agencies: JSON.stringify(formData.agencyIds || []),
    agencyWorkType: JSON.stringify(formData.agency || []),
    agencyWorkTypeCode: JSON.stringify(formData.agencyCodes || []),
    timeTrackingDateEntry: formData.datefrom,
    description: formData.description || '',
    ...durations,
  };
}

export async function addTimeEntry(formData, user) {
  await assertNotLocked(formData.datefrom, user);

  // Only a billing admin may create an entry for someone else (matches the frontend's
  // "Someone Else" picker); a standard user's own userId in the body is otherwise ignored.
  const ownerId = isPrivileged(user) && formData.userId ? formData.userId : user.userId;

  const now = new Date();
  const entry = await TimeEntry.create({
    userId: ownerId,
    ...buildEntryFields(formData),
    isSubmitted: IS_SUBMITTED.DRAFT,
    isDeleted: '0',
    addedToInvoice: '0',
    createdDate: now,
    updatedDate: now,
  });

  return { id: entry.id };
}

export async function editTimeEntry(id, formData, user) {
  const entry = await TimeEntry.findByPk(id);
  if (!entry) return null;
  if (!isPrivileged(user) && entry.userId !== user.userId) return null;
  assertInvoiceUnlocked(entry, 'edited');

  await assertNotLocked(formData.datefrom, user, {
    allowRejectedBypass: entry.isSubmitted === IS_SUBMITTED.REJECTED,
  });

  const previous = entry.toJSON();
  const fields = buildEntryFields(formData);
  // Decision #2: editing always resets to draft, requiring re-submission.
  await entry.update({ ...fields, isSubmitted: IS_SUBMITTED.DRAFT, updatedDate: new Date() });

  await writeActivityLog({
    action: 'Modified',
    timeEntryId: entry.id,
    previous,
    next: fields,
    actorId: user.userId,
    actor: user,
  });

  return { id: entry.id };
}

/**
 * `formData` is optional: create-then-submit/duplicate-then-submit already wrote the entry's
 * fields in a preceding call, so they submit with no body. Editing an existing entry and
 * hitting Submit sends the whole form here instead, in one call (matches legacy).
 */
export async function submitTimeEntry(id, formData, user) {
  const entry = await TimeEntry.findByPk(id);
  if (!entry) return null;
  if (!isPrivileged(user) && entry.userId !== user.userId) return null;
  assertInvoiceUnlocked(entry, 'submitted');

  // Guarded like approveTimeEntry: only a body that actually carries task+agency resaves
  // fields, so a partial body can't blank out task/agency/duration.
  const fields = formData?.task && formData?.agency ? buildEntryFields(formData) : {};
  await assertNotLocked(formData?.datefrom || entry.timeTrackingDateEntry, user, {
    allowRejectedBypass: entry.isSubmitted === IS_SUBMITTED.REJECTED,
  });

  const previous = entry.toJSON();
  await entry.update({ ...fields, isSubmitted: IS_SUBMITTED.SUBMITTED, updatedDate: new Date() });

  await writeActivityLog({
    action: 'Submitted',
    timeEntryId: entry.id,
    previous,
    next: entry.toJSON(),
    actorId: user.userId,
    actor: user,
  });

  return { id: entry.id };
}

/** Decision #7: always assigned to the current user. Date is whatever the client submits. */
export async function duplicateTimeEntry(sourceId, formData, user) {
  const source = await TimeEntry.findByPk(sourceId);
  if (!source) return null;

  await assertNotLocked(formData.datefrom, user, {
    allowRejectedBypass: source.isSubmitted === IS_SUBMITTED.REJECTED,
  });

  const now = new Date();
  const fields = buildEntryFields(formData);
  const entry = await TimeEntry.create({
    userId: user.userId,
    ...fields,
    isSubmitted: IS_SUBMITTED.DRAFT,
    isDeleted: '0',
    addedToInvoice: '0',
    createdDate: now,
    updatedDate: now,
  });

  return { id: entry.id };
}

/** Decision #12: scoped to the requester unless they're a billing admin. */
export async function getTimeEntryById(id, user) {
  const entry = await TimeEntry.findByPk(id, {
    include: [
      { model: TimeEntryTask, as: 'taskDetail', attributes: ['taskName', 'taskAbbreviation'] },
      // The entry's real owner, fetched directly -- not looked up against the "Someone Else"
      // picker's eligibility list, since Review & Post's "View Entry" must show whoever the
      // entry actually belongs to, eligible or not.
      { model: JudgeAssistantClerk, as: 'employee', attributes: ['firstName', 'lastName'] },
    ],
  });
  if (!entry) return null;
  if (!isPrivileged(user) && entry.userId !== user.userId) return null;

  const plain = entry.toJSON();
  const lock = await getPeriodLockForDate(plain.timeTrackingDateEntry);
  const readOnly = plain.addedToInvoice === '1' || (lock.locked && !isPrivileged(user));

  return { ...plain, readOnlyTimeEntry: readOnly };
}

/** Decision #3: invoice-lock-checked, and only a draft or submitted entry can be deleted. */
export async function deleteTimeEntry(id, user) {
  const entry = await TimeEntry.findByPk(id);
  if (!entry) return null;
  if (!isPrivileged(user) && entry.userId !== user.userId) return null;
  assertInvoiceUnlocked(entry, 'deleted');
  if (entry.isSubmitted !== IS_SUBMITTED.DRAFT && entry.isSubmitted !== IS_SUBMITTED.SUBMITTED) {
    const error = new Error('Only draft or submitted entries can be deleted.');
    error.status = 400;
    throw error;
  }

  await entry.update({ isDeleted: '1' });
  return { id: entry.id };
}

/**
 * Matches legacy: when task/agency are present, the (possibly just-edited) fields are resaved
 * alongside the status flip. `formData` is absent for bulk approve, which stays a pure flip.
 */
export async function approveTimeEntry(id, formData, user) {
  if (!isPrivileged(user)) return null;
  const entry = await TimeEntry.findByPk(id);
  if (!entry) return null;
  assertInvoiceUnlocked(entry, 'approved');

  const previous = entry.toJSON();
  const fields = formData?.task && formData?.agency ? buildEntryFields(formData) : {};
  await entry.update({ ...fields, isSubmitted: IS_SUBMITTED.APPROVED, updatedDate: new Date() });

  await writeActivityLog({
    action: 'Approved',
    timeEntryId: entry.id,
    previous,
    next: entry.toJSON(),
    actorId: user.userId,
    actor: user,
  });

  return { id: entry.id };
}

export async function rejectTimeEntry(id, comments, user) {
  if (!isPrivileged(user)) return null;
  const entry = await TimeEntry.findByPk(id);
  if (!entry) return null;
  assertInvoiceUnlocked(entry, 'rejected');

  const previous = entry.toJSON();
  await entry.update({
    isSubmitted: IS_SUBMITTED.REJECTED,
    rejectionComments: comments || '',
    updatedDate: new Date(),
  });

  await writeActivityLog({
    action: 'Rejected',
    timeEntryId: entry.id,
    previous,
    next: entry.toJSON(),
    actorId: user.userId,
    actor: user,
    rejectionReason: comments || '',
  });

  await sendTimeEntryRejectionNotification({
    timeEntryId: entry.id,
    entryOwnerId: entry.userId,
    entryDate: entry.timeTrackingDateEntry,
    actorUserId: user.userId,
  });

  return { id: entry.id };
}
