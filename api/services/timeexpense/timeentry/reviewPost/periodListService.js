/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Review & Post Level 1 -- period list with live status-tab counts and
                pagination, plus status transitions. Ports PHP getAllTimeEntryPeriodsAction's
                period-list branch and updateTimeEntryPeriodStatusAction. Also home to
                getEntryCounts/getHours/secondsToHHMM, shared with Level 2's per-user summary
                (periodUserSummaryService.js) -- both take an optional userId, period-wide when
                omitted, matching legacy's own getEntriesByStatus/gethoursByStatus.
*/
import { Op, fn, col } from 'sequelize';
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import TimeEntryPeriod from '../../../../models/timeexpense/timeentry/TimeEntryPeriod.js';
import TimeEntryPeriodStatus from '../../../../models/timeexpense/timeentry/TimeEntryPeriodStatus.js';
import { dateRangeWhere } from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';
import { PERIOD_STATUS } from '../periodService.js';

export { updatePeriodStatus } from '../periodService.js';

// ── Shared -- entry counts / hours for a date range, optionally scoped to one user ──

const NOT_REJECTED = { [Op.ne]: '3' };

export function secondsToHHMM(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Counts of submitted/not-submitted/rejected entries in a date range -- period-wide when userId is omitted. */
export async function getEntryCounts(dateRange, userId = null) {
  const base = { isDeleted: '0', [Op.and]: [dateRange] };
  if (userId) base.userId = userId;

  const [submittedEntries, notSubmittedEntries, rejectedEntries] = await Promise.all([
    TimeEntry.count({ where: { ...base, isSubmitted: '1' } }),
    TimeEntry.count({ where: { ...base, isSubmitted: '0' } }),
    TimeEntry.count({ where: { ...base, isSubmitted: '3' } }),
  ]);

  return { submittedEntries, notSubmittedEntries, rejectedEntries };
}

/** Total + billable hours (in seconds) in a date range, all-but-rejected -- period-wide when userId is omitted. */
export async function getHours(dateRange, userId = null) {
  const base = { isDeleted: '0', isSubmitted: NOT_REJECTED, [Op.and]: [dateRange] };
  if (userId) base.userId = userId;

  const [totalRow] = await TimeEntry.findAll({
    attributes: [[fn('SUM', fn('TIME_TO_SEC', col('rounded_up_time'))), 'seconds']],
    where: base,
    raw: true,
  });

  const [billableRow] = await TimeEntry.findAll({
    attributes: [[fn('SUM', fn('TIME_TO_SEC', col('TimeEntry.rounded_up_time'))), 'seconds']],
    include: [{ model: TimeEntryTask, as: 'taskDetail', attributes: [], where: { isBillable: '1' } }],
    where: base,
    raw: true,
  });

  return {
    totalSeconds: Number(totalRow?.seconds) || 0,
    billableSeconds: Number(billableRow?.seconds) || 0,
  };
}

// ── Level 1 -- period list ───────────────────────────────────────────────────────

const STATUS_FILTER_TO_ID = {
  Open: PERIOD_STATUS.OPEN,
  Inreview: PERIOD_STATUS.IN_REVIEW,
  Closed: PERIOD_STATUS.CLOSED,
};

function yearRangeWhere(year) {
  if (!year) return {};
  return { entryStart: { [Op.gte]: `${year}-01-01` }, entryEnd: { [Op.lte]: `${year}-12-31` } };
}

/** Tab counts, independent of pagination/status-filter -- matches legacy's all/open/inReview/closed. */
async function getStatusCounts(year) {
  const baseWhere = { isDeleted: '0', isVisible: '1', ...yearRangeWhere(year) };

  const [all, open, inReview, closed] = await Promise.all([
    TimeEntryPeriod.count({ where: baseWhere }),
    TimeEntryPeriod.count({ where: { ...baseWhere, fkPeriodStatusId: PERIOD_STATUS.OPEN } }),
    TimeEntryPeriod.count({ where: { ...baseWhere, fkPeriodStatusId: PERIOD_STATUS.IN_REVIEW } }),
    TimeEntryPeriod.count({ where: { ...baseWhere, fkPeriodStatusId: PERIOD_STATUS.CLOSED } }),
  ]);

  return { all, open, inReview, closed };
}

/** One period row, with its own submitted/not-submitted/rejected counts and billable/total hours. */
async function buildPeriodRow(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  const dateRange = dateRangeWhere('time_tracking_date_entry', plain.entryStart, plain.entryEnd);

  const [{ submittedEntries, notSubmittedEntries, rejectedEntries }, hours] = await Promise.all([
    getEntryCounts(dateRange),
    getHours(dateRange),
  ]);

  return {
    id: plain.id,
    entryPeriod: plain.entryPeriod,
    entryStart: plain.entryStart,
    entryEnd: plain.entryEnd,
    periodStatusId: plain.fkPeriodStatusId,
    periodStatus: plain.status?.periodStatus,
    submittedEntries,
    notSubmittedEntries,
    rejectedEntries,
    billableHours: secondsToHHMM(hours.billableSeconds),
    totalHours: secondsToHHMM(hours.totalSeconds),
  };
}

export async function listPeriods({ statusFilter = 'All', year, page = 1, pageSize = 10 }) {
  const where = { isDeleted: '0', isVisible: '1', ...yearRangeWhere(year) };
  if (statusFilter !== 'All' && STATUS_FILTER_TO_ID[statusFilter]) {
    where.fkPeriodStatusId = STATUS_FILTER_TO_ID[statusFilter];
  }

  const [{ count, rows }, counts] = await Promise.all([
    TimeEntryPeriod.findAndCountAll({
      where,
      include: [{ model: TimeEntryPeriodStatus, as: 'status' }],
      order: [['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    getStatusCounts(year),
  ]);

  const periods = await Promise.all(rows.map(buildPeriodRow));
  return { periods, totalRecords: count, counts };
}
