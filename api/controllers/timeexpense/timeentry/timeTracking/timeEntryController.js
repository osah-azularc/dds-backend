/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Every Time Entry / day-form endpoint -- calendar reads (month/week/day,
                open-period, period-lock check, dropdown options) and single-entry mutations
                (create/edit/submit/duplicate/delete/getById/activity/approve/reject). Thin
                controllers over services/timeexpense/timeentry/*; merged into one file since
                every handler here backs the same day form / calendar screen.
*/
import { getMonthEntries, getWeekEntries, getDayEntries, getTaskAgencyOptions } from '../../../../services/timeexpense/timeentry/timeTracking/timeEntryCalendarService.js';
import { getOpenPeriod, getOpenPeriodRanges, getPeriodLockForDate } from '../../../../services/timeexpense/timeentry/periodService.js';
import {
  addTimeEntry,
  editTimeEntry,
  submitTimeEntry,
  duplicateTimeEntry,
  getTimeEntryById,
  deleteTimeEntry,
  approveTimeEntry,
  rejectTimeEntry,
} from '../../../../services/timeexpense/timeentry/timeTracking/timeEntryCrudService.js';
import { getActivityLog } from '../../../../services/timeexpense/timeentry/activityLogService.js';
import { sendResult, sendNotFound, sendError } from '../timeEntryResponseHelpers.js';

// ── Calendar reads ────────────────────────────────────────────────────────────────

export async function getMonth(req, res) {
  try {
    const data = await getMonthEntries(req.user.userId, req.body);
    return sendResult(res, data);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching month entries:', fallbackMessage: 'Failed to fetch month entries.' });
  }
}

export async function getWeek(req, res) {
  try {
    const data = await getWeekEntries(req.user.userId, req.body);
    return sendResult(res, data);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching week entries:', fallbackMessage: 'Failed to fetch week entries.' });
  }
}

export async function getDay(req, res) {
  try {
    const data = await getDayEntries(req.user.userId, req.body.date);
    return sendResult(res, data);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching day entries:', fallbackMessage: 'Failed to fetch day entries.' });
  }
}

export async function getOpenPeriodHandler(req, res) {
  try {
    const period = await getOpenPeriod();
    return sendResult(res, period);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching open period:', fallbackMessage: 'Failed to fetch open period.' });
  }
}

export async function checkPeriodStatus(req, res) {
  try {
    const lock = await getPeriodLockForDate(req.body.date);
    return sendResult(res, lock);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error checking period status:', fallbackMessage: 'Failed to check period status.' });
  }
}

// US-2.1: the day form's own date picker uses this to gray out non-open dates for standard
// users, instead of only finding out a date is locked after picking it and hitting Save.
export async function getOpenPeriodRangesHandler(req, res) {
  try {
    const ranges = await getOpenPeriodRanges();
    return sendResult(res, ranges);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching open period ranges:', fallbackMessage: 'Failed to fetch open period ranges.' });
  }
}

export async function getOptions(req, res) {
  try {
    const options = await getTaskAgencyOptions();
    return sendResult(res, options);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching task/agency options:', fallbackMessage: 'Failed to fetch options.' });
  }
}

// ── Day-form mutations ───────────────────────────────────────────────────────────

export async function create(req, res) {
  try {
    const result = await addTimeEntry(req.body, req.user);
    return sendResult(res, result, { message: 'Time entry added successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error adding time entry:', fallbackMessage: 'Failed to add time entry.' });
  }
}

export async function update(req, res) {
  try {
    const result = await editTimeEntry(req.body.timeEntryId, req.body, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry updated successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error editing time entry:', fallbackMessage: 'Failed to edit time entry.' });
  }
}

export async function submit(req, res) {
  try {
    const { timeEntryId, ...rest } = req.body || {};
    const formData = Object.keys(rest).length ? rest : null;
    const result = await submitTimeEntry(timeEntryId, formData, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry submitted successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error submitting time entry:', fallbackMessage: 'Failed to submit time entry.' });
  }
}

export async function duplicate(req, res) {
  try {
    const result = await duplicateTimeEntry(req.body.timeEntryId, req.body, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry duplicated successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error duplicating time entry:', fallbackMessage: 'Failed to duplicate time entry.' });
  }
}

export async function getById(req, res) {
  try {
    const entry = await getTimeEntryById(req.body.timeEntryId, req.user);
    if (!entry) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, entry);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching time entry:', fallbackMessage: 'Failed to fetch time entry.' });
  }
}

export async function getActivity(req, res) {
  try {
    const activity = await getActivityLog(req.body.timeEntryId);
    return sendResult(res, activity);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching activity log:', fallbackMessage: 'Failed to fetch activity log.' });
  }
}

export async function remove(req, res) {
  try {
    const result = await deleteTimeEntry(req.body.timeEntryId, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry deleted successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error deleting time entry:', fallbackMessage: 'Failed to delete time entry.' });
  }
}

export async function approve(req, res) {
  try {
    const result = await approveTimeEntry(req.body.timeEntryId, req.body, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry approved successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error approving time entry:', fallbackMessage: 'Failed to approve time entry.' });
  }
}

export async function reject(req, res) {
  try {
    const result = await rejectTimeEntry(req.body.timeEntryId, req.body.comments, req.user);
    if (!result) return sendNotFound(res, 'Time entry not found.');
    return sendResult(res, result, { message: 'Time entry rejected successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error rejecting time entry:', fallbackMessage: 'Failed to reject time entry.' });
  }
}
