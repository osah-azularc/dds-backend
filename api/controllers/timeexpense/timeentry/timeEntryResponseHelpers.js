/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Shared response envelope helpers for the Time Entry / Review & Post
                controllers -- same {status,success,message,data,error} shape as
                adminCrudResponseHelpers.js (Admin Time & Expense's sibling module), but not
                built on that file's list/details/save/status-toggle CRUD shape since this
                module's responses vary far more (calendar payloads, activity logs, bulk
                actions, CSV streams).
*/
import { logger } from '../../../../config/winstonLogger.js';

export function sendResult(res, data, { message = null, status = 200 } = {}) {
  return res.status(status).json({ status, success: true, message, data, error: null });
}

export function sendNotFound(res, message) {
  return res.status(200).json({ status: 200, success: false, message, data: null, error: message });
}

/** For a business-rule failure the service throws with `.status`/`.message` set (e.g. period lock, invoice lock). */
export function sendError(res, error, { logPrefix, fallbackMessage }) {
  if (error.status && error.status < 500) {
    return res.status(error.status).json({
      status: error.status,
      success: false,
      message: error.message,
      data: null,
      error: error.message,
    });
  }

  logger.error(logPrefix, error);
  return res.status(500).json({
    status: 500,
    success: false,
    message: fallbackMessage,
    data: null,
    error: error.message,
  });
}
