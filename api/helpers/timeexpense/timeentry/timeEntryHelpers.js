/*
  Small shared helpers used across the Time Entry backend (calendar/day-form reads, Review &
  Post's bulk actions/export, activity log): a date-only range comparison, a tolerant JSON-array
  parser, and the time_entry.is_submitted status codes. Each was reimplemented separately in
  several services before being pulled into one file here.
*/
import { Op, fn, col, where as sequelizeWhere } from 'sequelize';

// ---- Date range WHERE clause -------------------------------------------------------------
// A date-only BETWEEN comparison against a DATETIME column, immune to Sequelize's own
// timezone-shifting of plain 'YYYY-MM-DD' bound strings. Verified directly against the DB:
// Op.between against a DataTypes.DATE column re-interprets each bound string through the
// server process's local UTC offset before building the SQL literal -- on this deployment
// (Asia/Calcutta, +5:30) that shifts a single-day range (start===end) to a near-zero-width
// window that can never match anything, and silently clips entries falling on a multi-day
// range's last day. Comparing DATE(column) against plain date strings instead sidesteps that
// stringification entirely -- the identical fix already used in bulkExportDocHelper.js's
// dateConditions for the exact same class of bug, applied here to every date-range query
// against time_entry.time_tracking_date_entry (Time Tracking's month/week/day views and
// Review & Post's period-scoped counts/entries/export, all of which share this one column).
export function dateRangeWhere(columnName, start, end) {
  return sequelizeWhere(fn('DATE', col(columnName)), { [Op.between]: [start, end] });
}

// ---- JSON array parsing -------------------------------------------------------------------
// Parses a JSON-array column (agencies/agencyWorkType/agencyWorkTypeCode on time_entry) back
// into an array, tolerating null/malformed values.
export function safeParseArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- is_submitted status codes -------------------------------------------------------------
// time_entry.is_submitted codes -- shared between timeEntryCrudService.js (single-entry
// add/edit/submit/approve/reject) and reviewPost/entriesService.js (the same status
// transitions, bulk).
export const IS_SUBMITTED = { DRAFT: '0', SUBMITTED: '1', APPROVED: '2', REJECTED: '3' };
