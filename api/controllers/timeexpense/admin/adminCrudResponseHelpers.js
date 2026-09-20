/*
  Created by  : Snehal Narkar
  Date        : 2026-08-21
  Description : Shared response envelope helpers for the Time & Expense admin controllers
                (Billing Roles, Billable Agencies, Time Entry Tasks, Expense Types) —
                previously copy-pasted per-entity as sendAgencyResult/sendTaskResult/
                sendRoleResult etc.
*/
import { logger } from '../../../../config/winstonLogger.js';

/**
 * Sends the standard {status,success,message,data:{result},error} envelope for a list
 * endpoint — success is always true (a query returning zero rows isn't an error), just
 * the message flips between `successMessage` and `emptyMessage`.
 */
export function sendEntityListResult(res, items, { emptyMessage, successMessage }) {
  return res.status(200).json({
    status: 200,
    success: true,
    message: items.length ? successMessage : emptyMessage,
    data: { result: items },
    error: null,
  });
}

/**
 * Sends the standard {status,success,message,data:{result},error} envelope for a single
 * resolved entity (details/save/status-toggle handlers), or the not-found variant when
 * `entity` is null.
 */
export function sendEntityResult(res, entity, { notFoundMessage, successMessage }) {
  if (!entity) {
    return res.status(200).json({
      status: 200,
      success: false,
      message: notFoundMessage,
      data: { result: null },
      error: notFoundMessage,
    });
  }

  return res.status(200).json({
    status: 200,
    success: true,
    message: successMessage,
    data: { result: entity },
    error: null,
  });
}

/**
 * Logs `error` and sends the standard 500 error envelope. `emptyResult` defaults to `null`
 * (single-entity handlers) — list handlers pass `[]` so the shape matches their success case.
 */
export function sendEntityServerError(res, error, { logPrefix, message, emptyResult = null }) {
  logger.error(logPrefix, error);
  return res.status(500).json({
    status: 500,
    success: false,
    message,
    data: { result: emptyResult },
    error: error.message,
  });
}
