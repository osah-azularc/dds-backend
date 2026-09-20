/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Period lookups shared by the Time Entry calendar/day-form (open-period bound,
                in-review/closed lock checks) and Review & Post (status transitions). Mirrors
                PHP TimeExpenseController's getAllOpenPeriodAction / checkInProgressTimeEntry
                PeriodsAction / checkClosedTimeEntryPeriodsAction / updateTimeEntryPeriodStatus
                Action -- consolidated into one date-range lookup instead of legacy's two
                separate in-review/closed checks (Time Tracking Audit, API surface section).
*/
import { Op } from 'sequelize';
import moment from 'moment';
import TimeEntryPeriod from '../../../models/timeexpense/timeentry/TimeEntryPeriod.js';
import TimeEntryPeriodStatus from '../../../models/timeexpense/timeentry/TimeEntryPeriodStatus.js';

export const PERIOD_STATUS = { OPEN: 1, IN_REVIEW: 2, CLOSED: 3 };

function toDateOnly(dateInput) {
  return moment(dateInput).format('YYYY-MM-DD');
}

/** Earliest visible open period -- bounds the date-picker's minimum selectable date for non-admins. */
export async function getOpenPeriod() {
  return TimeEntryPeriod.findOne({
    where: { isDeleted: '0', isVisible: '1', fkPeriodStatusId: PERIOD_STATUS.OPEN },
    order: [['id', 'ASC']],
  });
}

/**
 * Every currently-open period's date range -- the day form's date picker uses this to gray
 * out any date that isn't inside one of these ranges (closed, in-review, or simply
 * uncovered), matching getPeriodLockForDate's own "anything not open blocks a non-admin
 * save" rule exactly, so the picker and the save-time validation never disagree.
 */
export async function getOpenPeriodRanges() {
  const periods = await TimeEntryPeriod.findAll({
    where: { isDeleted: '0', fkPeriodStatusId: PERIOD_STATUS.OPEN },
    attributes: ['id', 'entryStart', 'entryEnd'],
    order: [['entryStart', 'ASC']],
  });
  return periods.map((period) => ({
    entryStart: toDateOnly(period.entryStart),
    entryEnd: toDateOnly(period.entryEnd),
  }));
}

/** The period (if any) whose date range covers `date`, with its status label attached. */
export async function getPeriodForDate(date) {
  const target = toDateOnly(date);
  return TimeEntryPeriod.findOne({
    where: {
      isDeleted: '0',
      entryStart: { [Op.lte]: target },
      entryEnd: { [Op.gte]: target },
    },
    include: [{ model: TimeEntryPeriodStatus, as: 'status' }],
    order: [['id', 'DESC']],
  });
}

/**
 * True when `date` falls in a period whose status blocks a non-admin save -- In Review or
 * Closed, or when no period covers the date at all. Callers pass admin/billing-admin context
 * and never call this for them; admins are never blocked (matches legacy). Carries no
 * rejected-entry exemption itself -- that's legacy's own in-review-only carve-out (never for
 * closed), applied by callers in timeEntryCrudService.js's assertNotLocked instead, since it
 * needs the entry's own current status, not just the date. Matches legacy's own fail-closed
 * behavior for a date with no covering period (getTimeEntryByIdAction, TimeExpenseController.
 * php:2067-2086 -- an empty period status falls to the read-only branch, not the editable one).
 */
export async function getPeriodLockForDate(date) {
  const period = await getPeriodForDate(date);
  if (!period) return { locked: true, reason: 'no-period', period: null };

  const statusId = period.fkPeriodStatusId;
  if (statusId === PERIOD_STATUS.IN_REVIEW) {
    return { locked: true, reason: 'in-review', period };
  }
  if (statusId === PERIOD_STATUS.CLOSED) {
    return { locked: true, reason: 'closed', period };
  }
  return { locked: false, period };
}

/** Review & Post status transition (Open/In Review/Closed) -- always a manual admin action. */
export async function updatePeriodStatus(id, statusId) {
  const period = await TimeEntryPeriod.findByPk(id);
  if (!period) return null;

  await period.update({ fkPeriodStatusId: statusId, manualUpdate: '1' });
  return { id: period.id, fkPeriodStatusId: period.fkPeriodStatusId };
}
