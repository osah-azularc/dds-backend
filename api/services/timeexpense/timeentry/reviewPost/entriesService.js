/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Review & Post Level 3 -- filtered/sorted entry list for one user in one
                period, plus bulk approve/reject/delete. Ports PHP getAllTimeEntriesAction
                and the bulk branches of approveTimeentryFormAction/rejectTimeentryFormAction/
                deleteTimeentryFormAction. Bulk approve is invoice-lock-checked -- legacy lets
                every selected id through regardless, but this is kept consistent with the
                single-entry approve path instead, which does check it -- and logs one
                activity row PER entry rather than legacy's single first-id-only row (a
                deliberate improvement, not a legacy match). Bulk reject never collects a
                comment (legacy's own UI has no field for one) and always persists an empty
                rejection_comments. All bulk writes run in one transaction, matching
                Invoicing's convention (invoiceActionsController.js).
*/
import { Op } from 'sequelize';
import moment from 'moment';
import { mysqlSequelize as sequelize } from '../../../../../connections/seqDB.js';
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import TimeEntryPeriod from '../../../../models/timeexpense/timeentry/TimeEntryPeriod.js';
import JudgeAssistantClerk from '../../../../models/JudgeAssistantClerk.js';
import { writeActivityLog } from '../activityLogService.js';
import {
  dateRangeWhere,
  safeParseArray,
  IS_SUBMITTED,
} from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';
import { sendTimeEntryRejectionNotification } from '../../../../helpers/notification/teNotificationHelper.js';
import { mapRoleType, getRatePerHour } from './periodUserSummaryService.js';

// Matches legacy's calculateBillableAmount/hoursandminscalculated (TimeExpenseController.php
// :3239-3240, :3460-3471): true decimal hours x the user's role rate, rounded to cents -- not
// gated on the task's billable flag (unlike the Level 1/2 "Billable Hours" aggregate, which
// is), since legacy computes this one the same way for every row regardless.
function calculateBillingAmount(roundedUpTime, ratePerHour) {
  if (!roundedUpTime || !ratePerHour) return 0;
  const [hours, minutes] = roundedUpTime.split(':').map(Number);
  const decimalHours = (hours || 0) + (minutes || 0) / 60;
  return decimalHours > 0 && ratePerHour > 0 ? Math.round(decimalHours * ratePerHour * 100) / 100 : 0;
}

function mapEntryRow(entry, ratePerHour) {
  const plain = entry.toJSON ? entry.toJSON() : entry;
  return {
    id: plain.id,
    userId: plain.userId,
    employee: plain.employee ? `${plain.employee.lastName}, ${plain.employee.firstName}` : null,
    roleType: mapRoleType(plain.employee?.subTypeRole),
    // Matches legacy's Work Task column exactly ({{time.task_abbreviation}} alone,
    // viewuserdetails.phtml:158) -- the abbreviation, not the full task name.
    task: plain.taskDetail ? plain.taskDetail.taskAbbreviation : plain.task,
    // Matches legacy's stripped agency_work_type_code column (comma-joined codes, no
    // brackets/quotes, TimeExpenseController.php:3180/3243) -- what's actually displayed,
    // not the full agency descriptions.
    agencyWorkTypeCode: safeParseArray(plain.agencyWorkTypeCode).join(', '),
    isSubmitted: plain.isSubmitted,
    date: moment(plain.timeTrackingDateEntry).format('MM/DD/YYYY'),
    roundedUpTime: plain.roundedUpTime,
    billingAmount: calculateBillingAmount(plain.roundedUpTime, ratePerHour),
    addedToInvoice: plain.addedToInvoice,
  };
}

export async function listEntries(
  periodId,
  userId,
  { task, status, sortOrder = 'ASC', page = 1, pageSize = 10 } = {},
) {
  const period = await TimeEntryPeriod.findByPk(periodId);
  if (!period) return null;

  const where = {
    isDeleted: '0',
    userId,
    [Op.and]: [dateRangeWhere('time_tracking_date_entry', period.entryStart, period.entryEnd)],
  };
  if (task) where.task = String(task);
  if (status !== undefined && status !== '') where.isSubmitted = String(status);

  const [{ count, rows }, allIds, user] = await Promise.all([
    TimeEntry.findAndCountAll({
      where,
      include: [
        { model: TimeEntryTask, as: 'taskDetail', attributes: ['taskName', 'taskAbbreviation'] },
        { model: JudgeAssistantClerk, as: 'employee', attributes: ['firstName', 'lastName', 'subTypeRole'] },
      ],
      // Matches legacy's default (no explicit sort chosen): `order by entry_date asc`
      // (TimeExpenseController.php:3215).
      order: [['timeTrackingDateEntry', sortOrder === 'DESC' ? 'DESC' : 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      // findAndCountAll's COUNT over an eager-loaded hasMany-style include would need
      // `distinct: true`, but both includes here are belongsTo (one row per entry either
      // way), so the plain count already matches.
    }),
    // Every id matching the current filters, ignoring pagination -- lets "Select All" pick up
    // rows sitting on other pages too, instead of only whatever page happens to be on screen
    // (a plain id-only query, so this stays cheap even though it re-runs the same where clause).
    TimeEntry.findAll({ where, attributes: ['id'], raw: true }),
    JudgeAssistantClerk.findByPk(userId, { attributes: ['subTypeRole'] }),
  ]);

  const ratePerHour = await getRatePerHour(user?.subTypeRole);
  return {
    entries: rows.map((entry) => mapEntryRow(entry, ratePerHour)),
    totalRecords: count,
    allIds: allIds.map((row) => row.id),
  };
}

/**
 * Shared skeleton behind every bulk action below: lock the requested rows, drop any already
 * invoiced (never eligible for a bulk mutation), run the caller's mutation inside the same
 * transaction, then commit or roll back as one unit. `mutate` gets the still-open transaction
 * so its own writes (and any activity-log rows it fires off) land atomically with the rest.
 */
async function withEligibleEntries(ids, mutate) {
  const transaction = await sequelize.transaction();
  try {
    const entries = await TimeEntry.findAll({
      where: { id: ids },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const eligible = entries.filter((entry) => entry.addedToInvoice !== '1');
    const eligibleIds = eligible.map((entry) => entry.id);
    const skippedIds = ids.filter((id) => !eligibleIds.includes(id));

    await mutate({ eligible, eligibleIds, transaction });

    await transaction.commit();
    return { eligible, eligibleIds, skippedIds };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Invoice-lock-checked (a deliberate deviation from legacy, which lets every selected id
 * through, even an already-invoiced one -- kept consistent with the single-entry approve path
 * instead, which does check it). Activity logging also deliberately does NOT match legacy
 * here, unlike everywhere else in this file: legacy only logs the first selected id, but one
 * row per entry (mirroring bulkReject below) is what actually lets each approved entry's own
 * date/duration/agency show up in its own activity trail, rather than every entry in the batch
 * showing only the first one's snapshot.
 */
export async function bulkApprove(ids, user) {
  const { eligibleIds, skippedIds } = await withEligibleEntries(
    ids,
    async ({ eligible, eligibleIds: idsToApprove, transaction }) => {
      if (idsToApprove.length) {
        await TimeEntry.update(
          { isSubmitted: IS_SUBMITTED.APPROVED, updatedDate: new Date() },
          { where: { id: idsToApprove }, transaction },
        );
      }

      await Promise.all(
        eligible.map((entry) =>
          writeActivityLog({
            action: 'Approved',
            timeEntryId: entry.id,
            previous: entry.toJSON(),
            next: { ...entry.toJSON(), isSubmitted: IS_SUBMITTED.APPROVED },
            actorId: user.userId,
            actor: user,
            transaction,
          }),
        ),
      );
    },
  );

  return { approvedIds: eligibleIds, skippedIds };
}

/**
 * Matches rejectTimeentryFormAction exactly: legacy's Review & Post UI has no comment field
 * for bulk reject at all -- $scope.comments is hardcoded to '' right before the call
 * regardless of anything the user might have typed elsewhere, so rejection_comments is always
 * persisted empty here too. Invoice-lock skip preserved (legacy's own reject action does
 * check added_to_invoice, unlike approve above).
 */
export async function bulkReject(ids, user) {
  const { eligible, skippedIds } = await withEligibleEntries(ids, async ({ eligible: eligibleEntries, transaction }) => {
    for (const entry of eligibleEntries) {
      const previous = entry.toJSON();
      await entry.update(
        { isSubmitted: IS_SUBMITTED.REJECTED, rejectionComments: '', updatedDate: new Date() },
        { transaction },
      );
      await writeActivityLog({
        action: 'Rejected',
        timeEntryId: entry.id,
        previous,
        next: entry.toJSON(),
        actorId: user.userId,
        actor: user,
        rejectionReason: '',
        transaction,
      });
    }
  });

  // Matches the pre-refactor order exactly: notifications fire after the transaction commits,
  // not inside it.
  await Promise.all(
    eligible.map((entry) =>
      sendTimeEntryRejectionNotification({
        timeEntryId: entry.id,
        entryOwnerId: entry.userId,
        entryDate: entry.timeTrackingDateEntry,
        actorUserId: user.userId,
      }),
    ),
  );

  return {
    rejectedIds: eligible.map((entry) => entry.id),
    skippedIds,
  };
}

export async function bulkDelete(ids) {
  const { eligibleIds, skippedIds } = await withEligibleEntries(ids, async ({ eligibleIds: idsToDelete, transaction }) => {
    if (idsToDelete.length) {
      await TimeEntry.update({ isDeleted: '1' }, { where: { id: idsToDelete }, transaction });
    }
  });

  return { deletedIds: eligibleIds, skippedIds };
}
