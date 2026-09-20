import {
  getHearingInfoByCasetypeAndCounty,
  checkSkipHearing,
  getConfidentialCaseType,
  getHearingTimeList,
} from '../helpers/osahForm1Helper.js';
import {
  addDocket,
  updateDocket,
  addDocketHistory,
  hearingDateManual,
} from '../services/osahForm1Service.js';
import {
  validateGetHearingInfoForDocket,
  validateCheckSkipHearing,
  validateGetConfidentialCaseType,
  validateAddDocket,
  validateUpdateDocket,
  validateAddHistory,
  validateHearingDateManual,
} from '../helpers/osahForm1Validators.js';
import { logger } from "../../config/winstonLogger.js";

/*
  Created by  : Snehal Narkar
  Date        : 2026-03-13
  Description : Controller for OSAH Form 1 (New Docket) left-panel APIs.
                Thin layer — request parsing, validation, and standardised
                responses only. All business logic lives in osahForm1Service.js;
                all data access lives in osahForm1Helper.js.
*/

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/hearing-info
 * @desc   Auto-populates judge, CMA, location, date and time for the selected
 *         case type + county (next upcoming hearing slot).
 *         Body: { casetypeId: number, countyId: number }
 */
export const getHearingInfoHandler = async (req, res) => {
  try {
    const { casetypeId, countyId } = validateGetHearingInfoForDocket(req.body || {});
    const data = await getHearingInfoByCasetypeAndCounty(casetypeId, countyId);
    return res.status(200).json({ success: true, message: data?.hearingDate ? 'Hearing info fetched.' : 'No upcoming hearing found.', data, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/check-skip-hearing
 * @desc   Checks whether the selected case type is configured to skip the
 *         hearing date step.
 *         Body: { casetypeId: number }
 */
export const checkSkipHearingHandler = async (req, res) => {
  try {
    const { casetypeId } = validateCheckSkipHearing(req.body || {});
    const skipHearing = await checkSkipHearing(casetypeId);
    return res.status(200).json({ success: true, message: 'Skip-hearing check completed.', data: { skipHearing }, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/confidential-case-type
 * @desc   Returns casefiletype for the given agency + case type combination.
 *         Body: { refagency: string, casetype: string }
 */
export const getConfidentialCaseTypeHandler = async (req, res) => {
  try {
    const { refagency, casetype } = validateGetConfidentialCaseType(req.body || {});
    const casefiletype = await getConfidentialCaseType(refagency, casetype);
    return res.status(200).json({ success: true, message: casefiletype ? 'Case type info fetched.' : 'Case type not found.', data: casefiletype ? { casefiletype } : null, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/add-docket
 * @desc   Creates a new docket record and generates the docket number.
 *         Replicates legacy Osahform/adddocket.
 *         Body: { docketdetails: Object, contyId: { conty_id: number } }
 */
export const addDocketHandler = async (req, res) => {
  try {
    const { docketdetails, contyId } = validateAddDocket(req.body || {});
    const countyId = contyId?.conty_id || null;
    const result = await addDocket(docketdetails, countyId);
    return res.status(200).json({ success: true, message: 'Docket created successfully.', data: result, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/update-docket
 * @desc   Updates an existing docket record.
 *         Replicates legacy Osahform/updatedocket.
 *         Body: { docketId, docketInfo, countyId?, reopenCaseFlag?, reopenHearingInfo? }
 */
export const updateDocketHandler = async (req, res) => {
  try {
    const validated = validateUpdateDocket(req.body || {});
    const caseId = String(validated.docketId);
    const docketInfo = validated.docketInfo;
    const countyId = validated.countyId?.countyId ?? null;
    const reopenCaseFlag = validated.reopenCaseFlag ?? '0';
    const reopenHearingInfo = validated.reopenHearingInfo ?? '';
    const modifiedBy =  req.user?.email?.split('@')[0] || 'system';
    const userId =  req.user?.id || 0;
    const { found, rowsAffected } = await updateDocket(caseId, docketInfo, {
      countyId,
      reopenCaseFlag,
      reopenHearingInfo,
      modifiedBy,
      userId,
    });

    if (!found) {
      return res.status(404).json({ success: false, message: 'Docket not found.', data: { rowsAffected }, error: null });
    }

    if (rowsAffected === 0) {
      return res.status(200).json({ success: true, message: 'No changes were applied to the docket.', data: { rowsAffected }, error: null });
    }

    return res.status(200).json({
      success: true,
      message: reopenCaseFlag === '1' ? 'Case was reopened successfully.' : 'Docket updated successfully.',
      data: { rowsAffected },
      error: null,
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/add-history
 * @desc   Inserts a history record after a docket action.
 *         Replicates legacy Osahform/add-history.
 *         Body: { caseId: string, message: string }
 */
export const addHistoryHandler = async (req, res) => {
  try {
    const { caseId, message } = validateAddHistory(req.body || {});
    const modifiedBy =  req.user?.email?.split('@')[0] || 'system';
    const result = await addDocketHistory(String(caseId), message, modifiedBy);
    return res.status(200).json({ success: true, message: 'History recorded successfully.', data: result, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  POST /osah-form1/hearingDateManual
 * @desc   Validates a manually-entered hearing slot (judge + assistant + location +
 *         date + time) against the calendar capacity limit.
 *         Returns { token, hearingDateValEnteredByUser, error } where
 *         error = 'maxNoOfCasesLimit' when the slot is already at/over capacity.
 *         Replicates legacy calendar/hearing-date-manual.
 *         Body: { condition: { token, judge_id, judge_assistant_id, court_location_id,
 *                              casetype_id, casetype, hearingTimeId, hearingTime,
 *                              hearingDate, hearingDateValEnteredByUser } }
 */
export const hearingDateManualHandler = async (req, res) => {
  try {
    const { condition } = validateHearingDateManual(req.body || {});
    const result = await hearingDateManual(condition);
    return res.status(200).json({ success: true, message: 'Hearing date manual validation completed.', data: result, error: null });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @route  GET /osahForm1/gethearingtimelist
 * @desc   Get list of all hearing times
 *         Response: Array of hearing time objects with all values as strings
 */
export const getHearingTimeListHandler = async (_req, res) => {
  try {
    const result = await getHearingTimeList();
    return res.status(200).json({ success: true, message: 'Hearing time data', data: result, error: null });
  } catch (error) {
    logger.error('Error fetching hearing time list:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.', data: null, error: error.message });
  }
};

