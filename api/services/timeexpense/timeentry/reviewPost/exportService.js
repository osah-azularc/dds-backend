/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : CSV/AAA export -- Review & Post Level 1's "Download" button. Ports PHP
                OsahformController::exportAAADataAction: joins time_entry -> employee ->
                billing role -> task, includes every submission status (no status filter),
                and explodes a multi-agency entry into one row per agency code (all sharing
                the same Activity ID), matching legacy exactly.
*/
import { Op } from 'sequelize';
import moment from 'moment';
import TimeEntry from '../../../../models/timeexpense/timeentry/TimeEntry.js';
import TimeEntryTask from '../../../../models/timeexpense/timeentry/TimeEntryTask.js';
import TimeEntryBillingRole from '../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js';
import JudgeAssistantClerk from '../../../../models/JudgeAssistantClerk.js';
import { convertH2M } from '../roundingService.js';
import { dateRangeWhere, safeParseArray } from '../../../../helpers/timeexpense/timeentry/timeEntryHelpers.js';
import { mapRoleType } from './periodUserSummaryService.js';

const CSV_HEADER = [
  'Activity ID', 'User', 'User Type', 'Agency Code', 'All Agency Codes', 'Task Name',
  'Task Description', 'Task Billable', 'Status', 'Date', 'Total Time', 'Split Time',
  'Rate', 'Split Hours', 'Split Amount', 'Total Amount',
];

const STATUS_LABELS = { 0: 'Not Submitted', 1: 'Submitted', 2: 'Approved', 3: 'Rejected' };

// A cell starting with =, +, -, @, tab, or CR opens as a formula in Excel/Sheets when the
// file is opened (formula injection) -- every field here (User, Task Name, Task Description,
// agency codes) is ultimately admin-entered data, not a fixed value, so any of them could
// carry one. Prefixing with ' forces the cell to plain text without changing what's displayed
// (Excel drops the leading ' on render). taskDescription's own literal-quote wrapping already
// starts with a safe character by coincidence, so this is a no-op for that field, not a
// double-prefix.
const FORMULA_LEADING_CHAR = /^[=+\-@\t\r]/;

function csvEscape(value) {
  let text = String(value ?? '');
  if (FORMULA_LEADING_CHAR.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsvRow(values) {
  return values.map(csvEscape).join(',');
}

export async function buildAAAExportCsv({ dateFrom, dateTo }) {
  const where = { isDeleted: '0' };
  if (dateFrom && dateTo) {
    where[Op.and] = [dateRangeWhere('time_tracking_date_entry', dateFrom, dateTo)];
  }

  const entries = await TimeEntry.findAll({
    where,
    include: [
      { model: TimeEntryTask, as: 'taskDetail', attributes: ['taskName', 'taskDescription', 'isBillable'] },
      { model: JudgeAssistantClerk, as: 'employee', attributes: ['firstName', 'lastName', 'subTypeRole'] },
    ],
    // Matches legacy's `order by judge_assistant_clerk.sub_type_role` exactly (exportAAAData
    // Action:16214), not user id.
    order: [[{ model: JudgeAssistantClerk, as: 'employee' }, 'subTypeRole', 'ASC']],
  });

  const rateCache = new Map();
  async function getRate(subTypeRole) {
    if (!subTypeRole) return 0;
    if (!rateCache.has(subTypeRole)) {
      const role = await TimeEntryBillingRole.findOne({ where: { subTypeRole } });
      rateCache.set(subTypeRole, Number(role?.ratePerHour) || 0);
    }
    return rateCache.get(subTypeRole);
  }

  const lines = [toCsvRow(CSV_HEADER)];

  for (const entry of entries) {
    const plain = entry.toJSON();
    const agencyCodes = safeParseArray(plain.agencyWorkTypeCode);
    const allAgencyCodes = agencyCodes.join(', ');
    const rate = await getRate(plain.employee?.subTypeRole);
    const splitHours = convertH2M(plain.splitTimeBtwnAgency?.slice(0, 5) || '00:00') / 60;
    const splitAmount = Math.round(splitHours * rate * 100) / 100;
    const totalHours = convertH2M(plain.roundedUpTime?.slice(0, 5) || '00:00') / 60;
    const totalAmount = Math.round(totalHours * rate * 100) / 100;

    const codes = agencyCodes.length ? agencyCodes : [''];
    codes.forEach((agencyCode) => {
      lines.push(
        toCsvRow([
          plain.id,
          `${plain.employee?.firstName || ''} ${plain.employee?.lastName || ''}`,
          mapRoleType(plain.employee?.subTypeRole),
          agencyCode,
          allAgencyCodes,
          plain.taskDetail?.taskName || '',
          `'${plain.taskDetail?.taskDescription || ''}'`,
          plain.taskDetail?.isBillable === '1' ? 'Billable' : 'Non Billable',
          STATUS_LABELS[plain.isSubmitted] || '',
          moment(plain.timeTrackingDateEntry).format('MM-DD-YYYY'),
          plain.roundedUpTime,
          plain.splitTimeBtwnAgency,
          rate,
          splitHours.toFixed(2),
          splitAmount.toFixed(2),
          totalAmount.toFixed(2),
        ]),
      );
    });
  }

  return lines.join('\n');
}
