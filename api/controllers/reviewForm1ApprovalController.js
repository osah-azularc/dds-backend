import path from 'node:path';
import fs from 'node:fs';
import Form1Docket from '../models/Form1Docket.js';
import Form1Documents from '../models/Form1Documents.js';
import { approveForm1, rejectForm1 } from '../services/reviewForm1/reviewForm1ApprovalService.js';
import { logger } from '../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Approve/Reject/document-exists-check handlers for the Form 1
                review detail page.
*/

/**
 * Authorization gate for approve/reject actions.
 * Mirrors legacy osah.repos ng-show="reviewdata.docketinfo.status == 'submitted'
 * && reviewdata.docketinfo.docketclerk == loggedUserName" — enforced server-side
 * here since PHP only enforced it client-side. Only the clerk a Form 1 is assigned
 * to may approve/reject it — chief-clerk status is not part of this specific gate.
 */
const canReviewForm1 = (req, form1) => {
  const loggedUserName = req.user?.email ? String(req.user.email).split('@')[0] : null;
  return !!loggedUserName && form1.docketClerk === loggedUserName;
};

/**
 * Loads the Form1Docket row for form1Id and applies the canReviewForm1 gate,
 * sending the 404/403 response itself when either check fails.
 * @returns {Promise<object|null>} the Form1Docket row, or null if a response was already sent
 */
const loadAuthorizedForm1 = async (req, res, form1Id) => {
  const form1 = await Form1Docket.findOne({ where: { form1Id } });
  if (!form1) {
    res.status(404).json({
      status: 404, success: false, message: 'Form 1 record not found', data: null, error: 'Form 1 record not found',
    });
    return null;
  }

  if (!canReviewForm1(req, form1)) {
    res.status(403).json({
      status: 403,
      success: false,
      message: 'You are not authorized to review this Form 1',
      data: null,
      error: 'Not authorized',
    });
    return null;
  }

  return form1;
};

/**
 * Approve a submitted Form 1 — creates the docket and, when nohType/newHearingDate/
 * newHearingTime are supplied, generates the NOH document in the same call
 * (mirrors PHP's single combined reviewformapproveAction()).
 *
 * Request body: { form1Id, approveReason, nohType?, newHearingDate?, newHearingTime? }
 * Response: { status, success, message, data: { automationFlag }, error }
 */
export const reviewFormApprove = async (req, res) => {
  try {
    const {
      form1Id, approveReason, nohType, newHearingDate, newHearingTime,
    } = req.body;

    const form1 = await loadAuthorizedForm1(req, res, form1Id);
    if (!form1) return undefined;

    const userName = `${req.user?.lastName || ''}, ${req.user?.firstName || ''}`.replaceAll(/(^, )|(, $)/g, '').trim();

    const data = await approveForm1(form1Id, {
      userId: req.userId,
      userName,
      approveReason,
      nohType,
      newHearingDate,
      newHearingTime,
    });

    return res.status(200).json({
      status: 200, success: true, message: 'Form 1 approved and docket created', data, error: null,
    });
  } catch (error) {
    logger.error('[ReviewForm1] reviewFormApprove error:', error);
    const status = error.status || 500;
    return res.status(status).json({
      status, success: false, message: error.message || 'Failed to approve Form 1', data: null, error: error.message || 'Failed to approve Form 1',
    });
  }
};

/**
 * Reject a submitted Form 1 (clones it for resubmission).
 *
 * Request body: { form1Id, rejectReason, rejectReasonType }
 * Response: { status, success, message, data: null, error }
 */
export const reviewFormReject = async (req, res) => {
  try {
    const { form1Id, rejectReason, rejectReasonType } = req.body;

    const form1 = await loadAuthorizedForm1(req, res, form1Id);
    if (!form1) return undefined;

    await rejectForm1(form1Id, { reason: rejectReason, reasonType: rejectReasonType });

    return res.status(200).json({
      status: 200, success: true, message: 'Form 1 rejected', data: null, error: null,
    });
  } catch (error) {
    logger.error('[ReviewForm1] reviewFormReject error:', error);
    const status = error.status || 500;
    return res.status(status).json({
      status, success: false, message: error.message || 'Failed to reject Form 1', data: null, error: error.message || 'Failed to reject Form 1',
    });
  }
};

/** Checks the document file exists on disk before the client opens it (mirrors PHP's file_exists() check). */
export const checkForm1DocumentExists = async (req, res) => {
  try {
    const docPath = req.body?.path;
    if (!docPath) {
      return res.status(400).json({
        status: 400, success: false, message: 'path is required', data: null, error: 'path is required',
      });
    }

    const document = await Form1Documents.findOne({ where: { documentFilePath: docPath } });
    if (!document) {
      return res.status(404).json({
        status: 404, success: false, message: 'Document not found', data: null, error: 'Document not found',
      });
    }

    const nodeEnv = process.env.NODE_ENV || 'local';
    const absolutePath = ['dev', 'stag', 'uat', 'prod'].includes(nodeEnv)
      ? path.join(process.env.EFS_BASE_PATH, docPath)
      : path.join(process.cwd(), 'public', docPath);

    return res.status(200).json({
      status: 200, success: true, message: null, data: { exists: fs.existsSync(absolutePath) }, error: null,
    });
  } catch (error) {
    logger.error('[ReviewForm1] checkForm1DocumentExists error:', error);
    return res.status(500).json({
      status: 500, success: false, message: 'Failed to check document', data: null, error: error.message,
    });
  }
};
