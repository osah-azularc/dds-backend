/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Review & Post Level 2 -- per-user rollup for one period. Ports PHP
                getAllTimeEntryPeriodsAction's per-user-drilldown branch. Split out of
                periodListService.js (Level 1) to stay under the ~300-line guideline; reuses
                that file's getEntryCounts/getHours/secondsToHHMM. Decision #8: each user row
                gets its own billable amount, not a running cumulative sum (a confirmed legacy
                defect, Time Tracking Audit 1.8 item 10) -- billable hours x the user's
                sub-type-role rate. getGroupedEntryCounts/getGroupedHours are GROUP-BY-user_id
                equivalents of getEntryCounts/getHours, used by buildUserRowsBatched for
                "every user in the period" (unbounded, unlike buildUserRow's per-user round
                trips); the single-user path (also reused by Level 3) still calls buildUserRow.
*/
import { Op, fn, col } from 'sequelize';
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import TimeEntryPeriod from '../../../../models/timeexpense/timeentry/TimeEntryPeriod.js';
import TimeEntryPeriodStatus from '../../../../models/timeexpense/timeentry/TimeEntryPeriodStatus.js';
import TimeEntryBillingRole from '../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js';
import JudgeAssistantClerk from '../../../../models/JudgeAssistantClerk.js';
import { dateRangeWhere } from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';
import { getEntryCounts, getHours, secondsToHHMM } from './periodListService.js';

const NOT_REJECTED = { [Op.ne]: '3' };

/** Hours (in seconds) for just the approved entries in a date range, for one user. */
async function getApprovedHoursSeconds(dateRange, userId) {
  const [row] = await TimeEntry.findAll({
    attributes: [[fn('SUM', fn('TIME_TO_SEC', col('rounded_up_time'))), 'seconds']],
    where: { isDeleted: '0', userId, isSubmitted: '2', [Op.and]: [dateRange] },
    raw: true,
  });
  return Number(row?.seconds) || 0;
}

/** GROUP BY user_id, is_submitted -- one query instead of 3 (submitted/not-submitted/rejected) x N users. */
async function getGroupedEntryCounts(dateRange) {
  const rows = await TimeEntry.findAll({
    attributes: ['userId', 'isSubmitted', [fn('COUNT', col('id')), 'cnt']],
    where: { isDeleted: '0', [Op.and]: [dateRange] },
    group: ['userId', 'isSubmitted'],
    raw: true,
  });

  const byUser = new Map();
  const ensure = (userId) => {
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        submittedEntries: 0,
        notSubmittedEntries: 0,
        rejectedEntries: 0,
        approvedEntries: 0,
      });
    }
    return byUser.get(userId);
  };
  rows.forEach(({ userId, isSubmitted, cnt }) => {
    const bucket = ensure(userId);
    const count = Number(cnt) || 0;
    if (isSubmitted === '1') bucket.submittedEntries = count;
    else if (isSubmitted === '0') bucket.notSubmittedEntries = count;
    else if (isSubmitted === '3') bucket.rejectedEntries = count;
    else if (isSubmitted === '2') bucket.approvedEntries = count;
  });
  return byUser;
}

/** GROUP BY user_id -- 3 queries total instead of 3 x N users (total/billable/approved hours). */
async function getGroupedHours(dateRange) {
  const baseWhere = { isDeleted: '0', isSubmitted: NOT_REJECTED, [Op.and]: [dateRange] };

  const [totalRows, billableRows, approvedRows] = await Promise.all([
    TimeEntry.findAll({
      attributes: ['userId', [fn('SUM', fn('TIME_TO_SEC', col('rounded_up_time'))), 'seconds']],
      where: baseWhere,
      group: ['userId'],
      raw: true,
    }),
    // Same include/where shape as getHours' own billable-hours query, just grouped -- the
    // qualified TimeEntry.user_id reference matches that same query's existing use of
    // col('TimeEntry.rounded_up_time') once a join is involved.
    TimeEntry.findAll({
      attributes: [
        [col('TimeEntry.user_id'), 'userId'],
        [fn('SUM', fn('TIME_TO_SEC', col('TimeEntry.rounded_up_time'))), 'seconds'],
      ],
      include: [{ model: TimeEntryTask, as: 'taskDetail', attributes: [], where: { isBillable: '1' } }],
      where: baseWhere,
      group: [col('TimeEntry.user_id')],
      raw: true,
    }),
    TimeEntry.findAll({
      attributes: ['userId', [fn('SUM', fn('TIME_TO_SEC', col('rounded_up_time'))), 'seconds']],
      where: { isDeleted: '0', isSubmitted: '2', [Op.and]: [dateRange] },
      group: ['userId'],
      raw: true,
    }),
  ]);

  const byUser = new Map();
  const ensure = (userId) => {
    if (!byUser.has(userId)) byUser.set(userId, { totalSeconds: 0, billableSeconds: 0, approvedSeconds: 0 });
    return byUser.get(userId);
  };
  totalRows.forEach(({ userId, seconds }) => {
    ensure(userId).totalSeconds = Number(seconds) || 0;
  });
  billableRows.forEach(({ userId, seconds }) => {
    ensure(userId).billableSeconds = Number(seconds) || 0;
  });
  approvedRows.forEach(({ userId, seconds }) => {
    ensure(userId).approvedSeconds = Number(seconds) || 0;
  });
  return byUser;
}

const ROLE_LABELS = { judge: 'ALJ', sa: 'SA', saalj: 'SAALJ' };

// Reused by Level 3 (entriesService.js) for its own per-entry billing amount and role label.
export function mapRoleType(subTypeRole) {
  return ROLE_LABELS[subTypeRole] || (subTypeRole ? subTypeRole.toUpperCase() : '');
}

export async function getRatePerHour(subTypeRole) {
  if (!subTypeRole) return 0;
  const role = await TimeEntryBillingRole.findOne({ where: { subTypeRole } });
  return Number(role?.ratePerHour) || 0;
}

// Reused by Level 3 (entriesService.js) for its own header summary box (same per-user stats).
export async function buildUserRow(userId, period) {
  const user = await JudgeAssistantClerk.findByPk(userId, {
    attributes: ['userId', 'firstName', 'lastName', 'subTypeRole'],
  });
  const dateRange = dateRangeWhere('time_tracking_date_entry', period.entryStart, period.entryEnd);

  const [
    { submittedEntries, notSubmittedEntries, rejectedEntries },
    approvedEntries,
    hours,
    ratePerHour,
    approvedSeconds,
  ] = await Promise.all([
    getEntryCounts(dateRange, userId),
    TimeEntry.count({ where: { isDeleted: '0', userId, isSubmitted: '2', [Op.and]: [dateRange] } }),
    getHours(dateRange, userId),
    getRatePerHour(user?.subTypeRole),
    getApprovedHoursSeconds(dateRange, userId),
  ]);

  const billableHoursValue = hours.billableSeconds / 3600;
  const billableAmount = Math.round(billableHoursValue * ratePerHour * 100) / 100;

  return {
    userId,
    firstName: user?.firstName,
    lastName: user?.lastName,
    roleType: mapRoleType(user?.subTypeRole),
    submittedEntries,
    approvedEntries,
    notSubmittedEntries,
    rejectedEntries,
    // Matches legacy's total_userwise_detailview_entries (TimeExpenseController.php:3061-3062).
    totalEntries: submittedEntries + notSubmittedEntries + rejectedEntries + approvedEntries,
    billableHours: secondsToHHMM(hours.billableSeconds),
    totalHours: secondsToHHMM(hours.totalSeconds),
    approvedHours: secondsToHHMM(approvedSeconds),
    billableHoursValue,
    totalHoursValue: hours.totalSeconds / 3600,
    totalSeconds: hours.totalSeconds,
    billableSeconds: hours.billableSeconds,
    billableAmount,
  };
}

/**
 * Same output shape as buildUserRow, one row per id in `userIds` -- but sourced from the
 * batched maps above instead of a per-user round trip. Used only by getPeriodUserSummary's
 * "every user in the period" path (userId not given); the single-user path keeps calling
 * buildUserRow directly, unaffected by this.
 */
async function buildUserRowsBatched(userIds, period) {
  const dateRange = dateRangeWhere('time_tracking_date_entry', period.entryStart, period.entryEnd);

  const [users, countsByUser, hoursByUser] = await Promise.all([
    JudgeAssistantClerk.findAll({
      where: { userId: { [Op.in]: userIds } },
      attributes: ['userId', 'firstName', 'lastName', 'subTypeRole'],
      raw: true,
    }),
    getGroupedEntryCounts(dateRange),
    getGroupedHours(dateRange),
  ]);

  const usersById = new Map(users.map((user) => [user.userId, user]));
  // Per-call cache (like exportService.js's own rateCache) -- a period's users are typically
  // only a handful of distinct roles, so this turns up to N rate lookups into one per role.
  const rateCache = new Map();
  const getCachedRate = async (subTypeRole) => {
    if (!subTypeRole) return 0;
    if (!rateCache.has(subTypeRole)) rateCache.set(subTypeRole, await getRatePerHour(subTypeRole));
    return rateCache.get(subTypeRole);
  };

  return Promise.all(
    userIds.map(async (id) => {
      const user = usersById.get(id);
      const counts = countsByUser.get(id) || {
        submittedEntries: 0,
        notSubmittedEntries: 0,
        rejectedEntries: 0,
        approvedEntries: 0,
      };
      const hours = hoursByUser.get(id) || { totalSeconds: 0, billableSeconds: 0, approvedSeconds: 0 };
      const ratePerHour = await getCachedRate(user?.subTypeRole);

      const billableHoursValue = hours.billableSeconds / 3600;
      const billableAmount = Math.round(billableHoursValue * ratePerHour * 100) / 100;

      return {
        userId: id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        roleType: mapRoleType(user?.subTypeRole),
        submittedEntries: counts.submittedEntries,
        approvedEntries: counts.approvedEntries,
        notSubmittedEntries: counts.notSubmittedEntries,
        rejectedEntries: counts.rejectedEntries,
        totalEntries:
          counts.submittedEntries + counts.notSubmittedEntries + counts.rejectedEntries + counts.approvedEntries,
        billableHours: secondsToHHMM(hours.billableSeconds),
        totalHours: secondsToHHMM(hours.totalSeconds),
        approvedHours: secondsToHHMM(hours.approvedSeconds),
        billableHoursValue,
        totalHoursValue: hours.totalSeconds / 3600,
        totalSeconds: hours.totalSeconds,
        billableSeconds: hours.billableSeconds,
        billableAmount,
      };
    }),
  );
}

export async function getPeriodUserSummary(periodId, { userId, page = 1, pageSize = 10 } = {}) {
  const period = await TimeEntryPeriod.findByPk(periodId, {
    include: [{ model: TimeEntryPeriodStatus, as: 'status' }],
  });
  if (!period) return null;

  // Single-user case (Level 3's own reuse of this function) keeps calling buildUserRow
  // directly -- batching has nothing to win for N=1. The "every user in the period" case
  // (Level 2's own screen) uses the batched path instead, since that's the one that was
  // running a fixed multiple of queries per user with no upper bound.
  let users;
  if (userId) {
    users = [await buildUserRow(userId, period)];
  } else {
    const distinctUsers = await TimeEntry.findAll({
      attributes: [[fn('DISTINCT', col('user_id')), 'userId']],
      where: {
        isDeleted: '0',
        [Op.and]: [dateRangeWhere('time_tracking_date_entry', period.entryStart, period.entryEnd)],
      },
      raw: true,
    });
    const userIds = distinctUsers.map((row) => row.userId);
    users = await buildUserRowsBatched(userIds, period);
  }
  // Matches legacy's `ORDER BY LastName` (TimeExpenseController.php:2977).
  users.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  const summary = users.reduce(
    (acc, row) => ({
      submittedEntries: acc.submittedEntries + row.submittedEntries,
      approvedEntries: acc.approvedEntries + row.approvedEntries,
      billableHoursValue: acc.billableHoursValue + row.billableHoursValue,
      totalHoursValue: acc.totalHoursValue + row.totalHoursValue,
      totalSeconds: acc.totalSeconds + row.totalSeconds,
      billableSeconds: acc.billableSeconds + row.billableSeconds,
      billableAmount: Math.round((acc.billableAmount + row.billableAmount) * 100) / 100,
    }),
    {
      submittedEntries: 0,
      approvedEntries: 0,
      billableHoursValue: 0,
      totalHoursValue: 0,
      totalSeconds: 0,
      billableSeconds: 0,
      billableAmount: 0,
    },
  );

  const totalRecords = users.length;
  const pagedUsers = users.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return {
    period: {
      id: period.id,
      entryPeriod: period.entryPeriod,
      periodStatus: period.status?.periodStatus,
      periodStatusId: period.fkPeriodStatusId,
    },
    users: pagedUsers,
    // Full unpaginated roster, for the "All Users" dropdown.
    allUsers: users.map(({ userId: id, firstName, lastName }) => ({ userId: id, firstName, lastName })),
    totalRecords,
    summary: {
      ...summary,
      // HH:MM, matching legacy's trimAfterLastColon(total_detailview_billable_hours)
      // (viewpostdetails.phtml:39) and Level 1's own period-list format -- the *Value
      // fields above are decimal and kept only for internal math (billableAmount etc.),
      // not for display.
      totalHours: secondsToHHMM(summary.totalSeconds),
      billableHours: secondsToHHMM(summary.billableSeconds),
    },
  };
}
