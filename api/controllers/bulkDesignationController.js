import {
  getNOHDropdownDataHelper,
  generateBulkNOHHelper,
} from '../helpers/bulkDesignationHelper.js';
import {
  getContinuanceDropdownDataHelper,
  getNextCalendarDateHelper,
  generateBulkContinuanceHelper,
} from '../helpers/bulkContinuanceHelper.js';
import {
  getDispositionDropdownDataHelper,
  generateBulkDispositionHelper,
} from '../helpers/bulkDispositionHelper.js';
import { logger } from '../../config/winstonLogger.js';
import { insertModuleAuditLog } from '../helpers/auditLogs.helper.js';
import Docket from '../models/Docket.js';
import {
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from '../constants/constant-messages.js';

// ─── Error codes ──────────────────────────────────────────────────────────────
/**
 * Machine-readable codes included in every error response body.
 * Clients can branch on `code` without parsing the `message` string.
 * All error responses share the shape: { success: false, code, message }
 */
const BULK_ERROR_CODES = {
  UNAUTHENTICATED: 'BULK_UNAUTHENTICATED', // 401 – JWT missing / invalid
  INVALID_INPUT:   'BULK_INVALID_INPUT',   // 400 – bad or missing request fields
  INTERNAL_ERROR:  'BULK_INTERNAL_ERROR',  // 500 – unexpected server-side failure
};

/**
 * Bulk Designation Controller - NOH (Notice of Hearing)
 *
 * Handles API endpoints for the Bulk Designation feature.
 * Kept separate from bulkEditController to avoid disrupting existing functionality.
 *
 * Author: eCourt Team
 * Date: 2026-02-27
 */

/**
 * Get grouped NOH display data for the selected dockets.
 * Expects POST body: { caseIds: [] }
 * Returns displayData keyed by "agency|casetype" with available NOH sub-types.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getNOHDropdownData = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds } = req.body;
    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    const data = await getNOHDropdownDataHelper(caseIds);
    res.json(data);
  } catch (error) {
    logger.error('Error in getNOHDropdownData controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

/**
 * Generate NOH documents in bulk for selected dockets.
 * Expects POST body: { caseIds: [], selections: { [agency|casetype]: automation_sub_type } }
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateBulkNOH = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds, selections } = req.body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    if (!selections || typeof selections !== 'object') {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'selections must be an object keyed by agency|casetype',
      });
    }

    const result = await generateBulkNOHHelper(caseIds, selections, req.user?.email?.split('@')[0] || 'system', userId);

    insertModuleAuditLog(
      userId,
      AUDIT_LOG_ACTIONS.CREATED,
      `{{User}} generated bulk NOH for ${caseIds.length} docket(s)`,
      AUDIT_LOG_MODULE_NAME.CASES,
      'bulk_noh',
      caseIds.join(','),
      '',
      JSON.stringify(selections),
      '',
    );

    res.json(result);
  } catch (error) {
    logger.error('Error in generateBulkNOH controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

// ─── Continuance ─────────────────────────────────────────────────────────────

export const getContinuanceDropdownData = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds } = req.body;
    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    const data = await getContinuanceDropdownDataHelper(caseIds);
    res.json(data);
  } catch (error) {
    logger.error('Error in getContinuanceDropdownData controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

export const getNextCalendarDate = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { casetypeId, countyId, caseId } = req.body;
    if (!casetypeId || !countyId) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'casetypeId and countyId are required',
      });
    }

    // Mirrors PHP: when case_id provided, fetch current hearing date and filter
    // calendar results to dates AFTER the current hearing date (true "next" slot).
    let currentHearingDate = null;
    if (caseId) {
      const docket = await Docket.findOne({
        where: { caseId: Number(caseId) },
        attributes: ['hearingDate'],
      });
      if (docket?.hearingDate) {
        currentHearingDate = new Date(docket.hearingDate).toISOString().slice(0, 10);
      }
    }

    const data = await getNextCalendarDateHelper(casetypeId, countyId, currentHearingDate);
    res.json(data || {});
  } catch (error) {
    logger.error('Error in getNextCalendarDate controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

export const generateBulkContinuance = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds, groupState } = req.body;
    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    if (!groupState || typeof groupState !== 'object') {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'groupState must be an object keyed by agency|casetype|county',
      });
    }
    const result = await generateBulkContinuanceHelper(caseIds, groupState, req.user?.email?.split('@')[0] || 'system');

    insertModuleAuditLog(
      userId,
      AUDIT_LOG_ACTIONS.CREATED,
      `{{User}} generated bulk continuance for ${caseIds.length} docket(s)`,
      AUDIT_LOG_MODULE_NAME.CASES,
      'bulk_continuance',
      caseIds.join(','),
      '',
      JSON.stringify(groupState),
      '',
    );

    res.json(result);
  } catch (error) {
    logger.error('Error in generateBulkContinuance controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

// ─── Disposition ──────────────────────────────────────────────────────────────

export const getDispositionDropdownData = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds } = req.body;
    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    const data = await getDispositionDropdownDataHelper(caseIds);
    res.json(data);
  } catch (error) {
    logger.error('Error in getDispositionDropdownData controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};

export const generateBulkDisposition = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        code: BULK_ERROR_CODES.UNAUTHENTICATED,
        message: 'Authentication required',
      });
    }
    const { caseIds, selections } = req.body;
    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'caseIds must be a non-empty array',
      });
    }
    if (!selections || typeof selections !== 'object') {
      return res.status(400).json({
        success: false,
        code: BULK_ERROR_CODES.INVALID_INPUT,
        message: 'selections must be an object keyed by agency|casetype',
      });
    }
    const result = await generateBulkDispositionHelper(caseIds, selections, req.user?.email?.split('@')[0] || 'system');

    insertModuleAuditLog(
      userId,
      AUDIT_LOG_ACTIONS.CREATED,
      `{{User}} generated bulk disposition for ${caseIds.length} docket(s)`,
      AUDIT_LOG_MODULE_NAME.CASES,
      'bulk_disposition',
      caseIds.join(','),
      '',
      JSON.stringify(selections),
      '',
    );

    res.json(result);
  } catch (error) {
    logger.error('Error in generateBulkDisposition controller:', error);
    res.status(500).json({
      success: false,
      code: BULK_ERROR_CODES.INTERNAL_ERROR,
      message: error.message,
    });
  }
};
