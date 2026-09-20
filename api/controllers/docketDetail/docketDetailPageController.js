import { logger } from '../../../config/winstonLogger.js';
import { getQuickActionsTemplates } from '../../helpers/docketDetail/documentDataHelper.js';
import {
  addDispositionByCaseId,
  getDispositionByCaseId,
  getDispositionCodeCount,
  getDispositionTypesList,
  saveDispositionByCaseId,
} from '../../helpers/docketDetail/dispositionHelper.js';
import { notifyDispositionAdded } from '../../helpers/docketDetail/osahForm1NotifyHelper.js';
import { getPartyDetailsByDocket } from '../../helpers/docketDetail/partyDetailsHelper.js';
import { validatePartyDetailsRequest } from '../../helpers/docketDetailPageValidators.js';

const getValidationMessage = (validationError) => validationError.details.map((detail) => detail.message).join(', ');

export async function getPartyDetails(req, res) {
  try {
    const { error, value } = validatePartyDetailsRequest(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: [],
        count: 0,
        error: getValidationMessage(error),
      });
    }

    const result = await getPartyDetailsByDocket(value.docketNo);
    return res.status(200).json({
      success: true,
      message: result.data.length > 0 ? 'Party details fetched successfully' : 'No party details found',
      data: result.data,
      count: result.count,
      error: null,
    });
  } catch (error) {
    logger.error('Error in getPartyDetails:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: [],
      count: 0,
      error: error.message,
    });
  }
}

export async function displayQuickActions(req, res) {
  try {
    const { caseId } = req.body;
    if (!caseId) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: null,
        error: 'caseId is required',
      });
    }

    const templates = await getQuickActionsTemplates(caseId);
    if (!templates) {
      return res.status(404).json({
        success: false,
        message: 'Docket not found',
        data: null,
        error: 'Docket not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Quick actions fetched successfully',
      data: templates,
      error: null,
    });
  } catch (error) {
    logger.error('Error in displayQuickActions:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
      error: error.message,
    });
  }
}

export async function getDisposition(req, res) {
  try {
    const { caseId } = req.body;
    const rows = await getDispositionByCaseId(caseId);

    return res.status(200).json({
      success: true,
      message: 'Disposition data fetched successfully',
      data: rows,
      error: null,
    });
  } catch (error) {
    logger.error('Error in getDisposition:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
      error: error.message,
    });
  }
}

export async function getDispositionTypes(_, res) {
  try {
    const rows = await getDispositionTypesList();

    return res.status(200).json({
      success: true,
      message: 'Disposition types fetched successfully',
      data: rows,
      error: null,
    });
  } catch (error) {
    logger.error('Error in getDispositionTypes:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: [],
      error: error.message,
    });
  }
}

export async function checkDispositionCode(req, res) {
  try {
    const dispositionCode = String(req.body?.dispositionCode || '').trim();
    if (!dispositionCode) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: { count: 0 },
        error: 'dispositionCode is required',
      });
    }

    const count = await getDispositionCodeCount(dispositionCode);

    return res.status(200).json({
      success: true,
      message: 'Disposition code checked successfully',
      data: { count },
      error: null,
    });
  } catch (error) {
    logger.error('Error in checkDispositionCode:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: { count: 0 },
      error: error.message,
    });
  }
}

export async function editDisposition(req, res) {
  try {
    const caseId = Number(req.body?.caseId);
    const dispositionData = req.body?.dispositionData || {};
    const dispositionCode = String(dispositionData?.dispositionCode || '').trim();
    const dispositionDate = String(dispositionData?.dispositionDate || '').trim();
    const signedByJudge = String(dispositionData?.signedByJudge || '').trim();
    const mailedDate = String(dispositionData?.mailedDate || '').trim();

    if (!caseId) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: null,
        error: 'caseId is required',
      });
    }

    if (!dispositionCode || !dispositionDate || !signedByJudge || !mailedDate) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: null,
        error: 'Disposition type, disposition date, date signed by judge, and date mailed are required',
      });
    }

    const dispositionRecord = await saveDispositionByCaseId(caseId, dispositionData);

    return res.status(200).json({
      success: true,
      message: 'Disposition updated successfully',
      data: dispositionRecord,
      error: null,
    });
  } catch (error) {
    logger.error('Error in editDisposition:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
      error: error.message,
    });
  }
}

// Mirrors PHP adddispositionAction: delete existing disposition, insert new, close docket,
// log docket_open_close_details, and notify ePortal users (flag='disposition').
export async function addDisposition(req, res) {
  try {
    const dispositionData = req.body?.dispositiondata || req.body?.dispositionData || {};
    const caseId = Number(dispositionData?.caseid ?? dispositionData?.caseId ?? req.body?.caseId);
    const userId = req.userId || 0;

    if (!caseId) {
      return res.status(400).json({ success: false, message: 'caseId is required', data: null });
    }

    const dispositionCode = String(dispositionData?.dispositioncode ?? dispositionData?.dispositionCode ?? '').trim();
    if (!dispositionCode) {
      return res.status(400).json({ success: false, message: 'dispositioncode is required', data: null });
    }

    await addDispositionByCaseId(caseId, dispositionData, userId);

    // Non-fatal — mirrors PHP notifyUsers(caseid, 0, 'disposition')
    notifyDispositionAdded(caseId).catch((notifyError) =>
      logger.error('Error in notifyDispositionAdded:', notifyError),
    );

    return res.status(200).json({ success: true, message: 'Disposition added successfully', data: null });
  } catch (error) {
    logger.error('Error in addDisposition:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: error.message });
  }
}