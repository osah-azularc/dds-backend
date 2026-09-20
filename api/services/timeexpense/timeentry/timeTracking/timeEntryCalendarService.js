/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Read-only data for the Time Tracking calendar/day-form: month/week/day entry
                fetch (every aggregate total computed here in SQL via Sequelize's fn/col --
                SEC_TO_TIME(SUM(TIME_TO_SEC(rounded_up_time))) -- the single value the frontend
                ever displays; legacy computed this same aggregate server-side but never
                consumed it, instead re-deriving totals with three divergent client-side
                algorithms, Time Tracking Audit decision #9, not reproduced here), plus the
                day form's Task/Agency/User dropdown options -- folded into this file since
                both back the same read-only endpoints on timeEntryController.js.
*/
import { Op, fn, col } from 'sequelize';
import moment from 'moment';
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import JudgeAssistantClerk from '../../../../models/JudgeAssistantClerk.js';
import { getTimeEntryTaskList } from '../../../../helpers/timeexpense/admin/adminTimeExpenseHelper.js';
import { getBillableAgencyList } from '../../../../helpers/timeexpense/admin/billableAgencyHelper.js';
import { dateRangeWhere, safeParseArray } from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';

const BASE_WHERE = { isDeleted: '0' };

// timeTrackingDateEntry is a Sequelize DataTypes.DATE column, so Sequelize hands it back as a
// JS Date (which JSON-serializes to a full ISO datetime, not 'YYYY-MM-DD') -- normalize it
// everywhere it's read out for grouping/display so it matches the plain date strings the
// frontend compares against (and so a Map keyed by it groups same-day entries together
// instead of by object-reference identity).
function toDateOnly(value) {
  return moment(value).format('YYYY-MM-DD');
}

function mapEntryRow(entry) {
  const plain = entry.toJSON ? entry.toJSON() : entry;
  return {
    id: plain.id,
    date: toDateOnly(plain.timeTrackingDateEntry),
    task: plain.taskDetail
      ? `${plain.taskDetail.taskName} (${plain.taskDetail.taskAbbreviation})`
      : plain.task,
    agencyWorkType: safeParseArray(plain.agencyWorkType),
    roundedUpTime: plain.roundedUpTime,
    splitTimeBtwnAgency: plain.splitTimeBtwnAgency,
    isSubmitted: plain.isSubmitted,
    description: plain.description || '',
    rejectionComments: plain.rejectionComments || '',
  };
}

async function findEntries(userId, { start, end }) {
  return TimeEntry.findAll({
    where: {
      ...BASE_WHERE,
      userId,
      [Op.and]: [dateRangeWhere('time_tracking_date_entry', start, end)],
    },
    include: [{ model: TimeEntryTask, as: 'taskDetail', attributes: ['taskName', 'taskAbbreviation'] }],
    order: [['timeTrackingDateEntry', 'ASC']],
  });
}

async function sumRoundedTime(userId, { start, end }) {
  const [row] = await TimeEntry.findAll({
    attributes: [[fn('SEC_TO_TIME', fn('SUM', fn('TIME_TO_SEC', col('rounded_up_time')))), 'total']],
    where: {
      ...BASE_WHERE,
      userId,
      [Op.and]: [dateRangeWhere('time_tracking_date_entry', start, end)],
    },
    raw: true,
  });
  return row?.total || '00:00:00';
}

// Legacy's calendar chips are agency-centric: one chip PER agency on a multi-agency entry, not
// one per entry (timentrybymonthcontroller.js's agency_work_type.forEach). Chips show the
// agency CODE ("BNR-AQ"), preferring agency_work_type_code over the description array when a
// code exists (timentrybymonthcontroller.js:236-239).
function explodeByAgency(entry) {
  const plain = entry.toJSON ? entry.toJSON() : entry;
  const codes = safeParseArray(plain.agencyWorkTypeCode);
  const descriptions = safeParseArray(plain.agencyWorkType);
  const rows = codes.length ? codes : descriptions;
  return (rows.length ? rows : ['-']).map((agencyName) => ({
    id: plain.id,
    agencyName: agencyName || '-',
    agencyTime: plain.splitTimeBtwnAgency || '00:00:00',
    roundedUpTime: plain.roundedUpTime || '00:00:00',
    isSubmitted: plain.isSubmitted,
  }));
}

/** One row per day with entries in range -- the shared shape behind both month and week views. */
async function groupByDay(userId, { start, end }) {
  const entries = await findEntries(userId, { start, end });
  const byDate = new Map();

  entries.forEach((entry) => {
    const dateKey = toDateOnly(entry.timeTrackingDateEntry);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(...explodeByAgency(entry));
  });

  return Promise.all(
    Array.from(byDate.entries()).map(async ([date, dayEntries]) => ({
      date,
      total: await sumRoundedTime(userId, { start: date, end: date }),
      hasRejected: dayEntries.some((entry) => entry.isSubmitted === '3'),
      entries: dayEntries,
    })),
  );
}

export async function getMonthEntries(userId, { firstDay, lastDay }) {
  const [days, monthTotal] = await Promise.all([
    groupByDay(userId, { start: firstDay, end: lastDay }),
    sumRoundedTime(userId, { start: firstDay, end: lastDay }),
  ]);
  return { days, monthTotal };
}

export async function getWeekEntries(userId, { startDate, endDate }) {
  const [days, weekTotal] = await Promise.all([
    groupByDay(userId, { start: startDate, end: endDate }),
    sumRoundedTime(userId, { start: startDate, end: endDate }),
  ]);
  return { days, weekTotal };
}

export async function getDayEntries(userId, date) {
  const [entries, dayTotal] = await Promise.all([
    findEntries(userId, { start: date, end: date }),
    sumRoundedTime(userId, { start: date, end: date }),
  ]);
  return { entries: entries.map(mapEntryRow), dayTotal };
}

// Matches legacy's getUserDetails query exactly (TimeExpenseController.php
// getAllTasksAgencyAction:463), not just isActive='1' -- that let extra rows through and
// read as duplicates in the "Someone Else" picker. cma users are stripped after the fetch,
// same as legacy (timeentrycontroller.js:208-215).
export async function getTaskAgencyOptions() {
  const [tasks, agencies, users] = await Promise.all([
    getTimeEntryTaskList(),
    getBillableAgencyList(),
    JudgeAssistantClerk.findAll({
      where: {
        [Op.or]: [
          { isActive: '1', userType: { [Op.in]: ['judge', 'sa'] } },
          { isActiveBilling: '1' },
          { isAdministrativePersonnel: '1' },
        ],
      },
      attributes: ['userId', 'firstName', 'lastName', 'userType'],
      order: [['lastName', 'ASC']],
    }),
  ]);

  return {
    tasks: tasks.filter((task) => task.isActive === '1'),
    agencies: agencies.filter((agency) => agency.isActive === '1'),
    users: users
      .filter((user) => user.userType !== 'cma')
      .map((user) => ({ userId: user.userId, firstName: user.firstName, lastName: user.lastName })),
  };
}
