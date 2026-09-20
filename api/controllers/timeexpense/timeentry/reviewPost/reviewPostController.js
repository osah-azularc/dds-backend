/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Every Review & Post endpoint -- Level 1 (period list/status), Level 2
                (per-user summary), Level 3 (entry list + bulk approve/reject/delete), and the
                CSV/AAA export. Thin controllers over services/timeexpense/timeentry/
                reviewPost/*; merged into one file since every handler here backs the same
                admin drill-down screen (mirrors adminTimeExpenseController.js's own
                multiple-entities-in-one-file convention).
*/
import { listPeriods, updatePeriodStatus } from '../../../../services/timeexpense/timeentry/reviewPost/periodListService.js';
import { getPeriodUserSummary } from '../../../../services/timeexpense/timeentry/reviewPost/periodUserSummaryService.js';
import { listEntries, bulkApprove, bulkReject, bulkDelete } from '../../../../services/timeexpense/timeentry/reviewPost/entriesService.js';
import { buildAAAExportCsv } from '../../../../services/timeexpense/timeentry/reviewPost/exportService.js';
import { sendResult, sendNotFound, sendError } from '../timeEntryResponseHelpers.js';

// ── Level 1 -- period list & status ─────────────────────────────────────────────

export async function getPeriods(req, res) {
  try {
    const data = await listPeriods(req.body);
    return sendResult(res, data);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching periods:', fallbackMessage: 'Failed to fetch periods.' });
  }
}

export async function updateStatus(req, res) {
  try {
    const result = await updatePeriodStatus(req.body.periodId, req.body.statusId);
    if (!result) return sendNotFound(res, 'Period not found.');
    return sendResult(res, result, { message: 'Period status updated successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error updating period status:', fallbackMessage: 'Failed to update period status.' });
  }
}

// ── Level 2 -- per-user summary ─────────────────────────────────────────────────

export async function getUserSummary(req, res) {
  try {
    const data = await getPeriodUserSummary(req.body.periodId, req.body);
    if (!data) return sendNotFound(res, 'Period not found.');
    return sendResult(res, data);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching period user summary:', fallbackMessage: 'Failed to fetch period summary.' });
  }
}

// ── Level 3 -- entry list + bulk actions ────────────────────────────────────────

export async function getEntries(req, res) {
  try {
    const entries = await listEntries(req.body.periodId, req.body.userId, req.body);
    if (!entries) return sendNotFound(res, 'Period not found.');
    return sendResult(res, entries);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error fetching entries:', fallbackMessage: 'Failed to fetch entries.' });
  }
}

export async function approveEntries(req, res) {
  try {
    const result = await bulkApprove(req.body.ids, req.user);
    return sendResult(res, result, { message: 'Time entries approved successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error approving entries:', fallbackMessage: 'Failed to approve entries.' });
  }
}

export async function rejectEntries(req, res) {
  try {
    const result = await bulkReject(req.body.ids, req.user);
    return sendResult(res, result, { message: 'Time entries rejected successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error rejecting entries:', fallbackMessage: 'Failed to reject entries.' });
  }
}

export async function deleteEntries(req, res) {
  try {
    const result = await bulkDelete(req.body.ids);
    return sendResult(res, result, { message: 'Time entries deleted successfully.' });
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error deleting entries:', fallbackMessage: 'Failed to delete entries.' });
  }
}

// ── CSV / AAA export ─────────────────────────────────────────────────────────────
// GET (browser-navigable download), unlike the rest of this module's POST-for-everything
// convention -- legacy triggers this via a raw form-POST-and-navigate; the port uses a plain
// GET + Content-Disposition so the frontend can trigger it with a normal link/window navigation.

export async function exportAAAData(req, res) {
  try {
    const csv = await buildAAAExportCsv(req.query);
    const fileName = `excelsheets${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(csv);
  } catch (error) {
    return sendError(res, error, { logPrefix: 'Error building AAA export:', fallbackMessage: 'Failed to build export.' });
  }
}
