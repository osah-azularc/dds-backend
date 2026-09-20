import * as calendarService from "./calendarService.js";
import { CalendarServiceError } from "./calendarService.js";
import { logger } from "../../../../config/winstonLogger.js";

// Business logic lives in calendarService.js; this file only translates
// HTTP requests into service calls and shapes the JSON response.
const respondError = (res, error, context, fallbackMessage) => {
  const isExpected = error instanceof CalendarServiceError;
  // Expected validation/not-found responses are logged at warn (visible, but
  // not an incident); anything unexpected is logged at error so real
  // failures (DB issues, bad associations, etc.) are always greppable.
  logger[isExpected ? "warn" : "error"](`[${context}]`, error);
  const status = isExpected ? error.status : 500;
  const message = isExpected ? error.message : fallbackMessage;
  return res.status(status).json({ status, message, success: false });
};

/**
 * Get calendar common data (circuits, casetype groups, judges, cmas, etc.)
 */
export const getCalendarCommonData = async (req, res) => {
  try {
    const data = await calendarService.getCalendarCommonData();
    return res.status(200).json({
      status: 200,
      message: "Calendar common data fetched successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getCalendarCommonData",
      "Calendar common data is unable to fetch at this time. Please try again.",
    );
  }
};

/**
 * Add or update calendar information
 */
export const addUpdateCalendarInfo = async (req, res) => {
  try {
    const { calendarId, circuit_id, casetype_group_id, casetypes } = req.body;
    const modifiedBy = req.userId || "system";

    const result = await calendarService.addUpdateCalendarInfo({
      calendarId,
      circuit_id,
      casetype_group_id,
      casetypes,
      modifiedBy,
    });

    return res.status(200).json({
      status: 200,
      message: result.isUpdate
        ? "Calendar updated successfully"
        : "Calendar created successfully",
      data: { calendarId: result.calendarId },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "addUpdateCalendarInfo",
      "Unable to save calendar at this time. Please try again.",
    );
  }
};

/**
 * Validate county and casetype combination for conflicts
 */
export const validateCountyCasetypeCombination = async (req, res) => {
  try {
    const notificationList =
      await calendarService.validateCountyCasetypeCombination(req.body);
    return res.status(200).json({
      status: 200,
      message: "County casetype combination validation completed successfully",
      data: { notificationList },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "validateCountyCasetypeCombination",
      "Unable to validate county casetype combination at this time. Please try again.",
    );
  }
};

/**
 * Delete calendar information
 */
export const deleteCalendarInfo = async (req, res) => {
  try {
    const { calendar_id } = req.body;
    const modifiedBy = req.userId ? req.userId.toString() : "System";

    await calendarService.deleteCalendarInfo(calendar_id, modifiedBy);

    return res.status(200).json({
      status: 200,
      message: "Calendar deleted successfully",
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "deleteCalendarInfo",
      "Unable to delete calendar at this time. Please try again later.",
    );
  }
};

/**
 * Get calendar details by ID for editing
 */
export const getCalendarDetailsById = async (req, res) => {
  try {
    const data = await calendarService.getCalendarDetailsById(
      req.params.calendarId,
    );
    return res.status(200).json({
      status: 200,
      message: "Calendar details fetched successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getCalendarDetailsById",
      "Unable to fetch calendar details at this time. Please try again.",
    );
  }
};

/**
 * Get calendar list with filters (circuit, casetype group, casetype, etc.),
 * paginated and sorted
 */
export const getCalendarList = async (req, res) => {
  try {
    const { condition = {} } = req.body;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const { data, count } = await calendarService.getCalendarList({
      condition,
      page,
      limit,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
    });

    return res.status(200).json({
      status: 200,
      message: "Calendar list fetched successfully",
      data,
      pagination: {
        page,
        limit,
        totalCount: count,
        totalPages: Math.ceil(count / limit),
      },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getCalendarList",
      "Unable to fetch calendar list at this time. Please try again.",
    );
  }
};

/**
 * Get a single calendar's hearing info rows (judge/CMA/location/time),
 * paginated and sorted - powers the "View Details" screen.
 */
export const getHearingInfo = async (req, res) => {
  try {
    const { condition = {} } = req.body;
    const { calendar_id: calendarId, ...restCondition } = condition;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const { calendar, hearingInfoList, hearingInfoTotal } =
      await calendarService.getHearingInfo({
        calendarId,
        condition: restCondition,
        page,
        limit,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
      });

    return res.status(200).json({
      status: 200,
      message: "Hearing info fetched successfully",
      data: { calendar, hearingInfoList, hearingInfoTotal },
      pagination: {
        page,
        limit,
        totalCount: hearingInfoTotal,
        totalPages: Math.ceil(hearingInfoTotal / limit),
      },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getHearingInfo",
      "Unable to fetch hearing info at this time. Please try again.",
    );
  }
};

/**
 * Add or update a calendar's hearing info row(s) - one row per hearing date
 * on create, or a single row update when hearingInfo.hearing_info_id is
 * present. Powers the "Add/Edit Hearing Details" modal on the View Details
 * screen.
 */
export const addUpdateHearingInfo = async (req, res) => {
  try {
    const { hearingInfo, datesList } = req.body;
    const modifiedBy = req.userId ? req.userId.toString() : "System";

    const result = await calendarService.saveHearingInfo({
      hearingInfo,
      datesList,
      modifiedBy,
    });

    return res.status(200).json({
      status: 200,
      message: result.isUpdate
        ? "Hearing info updated successfully"
        : "Hearing info added successfully",
      data: result,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "addUpdateHearingInfo",
      "Unable to save hearing info at this time. Please try again.",
    );
  }
};

/**
 * Check whether one or more candidate hearing dates conflict with an
 * existing hearing (same county+casetype grouping, same time slot), and
 * whether a later same-day slot already requires a "max number of cases"
 * cap. Run before update-hearing-info is submitted.
 */
export const checkDuplicateHearingDate = async (req, res) => {
  try {
    const { calendarId, timeId, hearingDate, datesList, hearingInfoId } = req.body;

    const data = await calendarService.checkDuplicateHearingDate({
      calendarId,
      timeId,
      hearingDate,
      datesList,
      hearingInfoId,
    });

    return res.status(200).json({
      status: 200,
      message: "Duplicate hearing date check completed",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "checkDuplicateHearingDate",
      "Unable to check hearing date conflicts at this time. Please try again.",
    );
  }
};

/**
 * Detailed "who else is scheduled" report for a hearing-date conflict -
 * powers the "View hearing date report." link shown alongside the
 * checkDuplicateHearingDate conflict messages.
 */
export const getDuplicateHearingDateReport = async (req, res) => {
  try {
    const { calendarId, timeId, hearingDate } = req.query;

    const data = await calendarService.getDuplicateHearingDateReport({
      calendarId,
      timeId,
      hearingDate,
    });

    return res.status(200).json({
      status: 200,
      message: "Duplicate hearing date report fetched successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getDuplicateHearingDateReport",
      "Unable to fetch the hearing date report at this time. Please try again.",
    );
  }
};

/**
 * Delete a single hearing info row and log an audit entry describing what
 * was removed - powers the trash icon on the View Details hearing table.
 */
export const deleteHearingInfo = async (req, res) => {
  try {
    const modifiedBy = req.userId ? req.userId.toString() : "System";

    const deleted = await calendarService.deleteHearingInfo({
      ...req.body,
      modifiedBy,
    });

    return res.status(200).json({
      status: 200,
      message: deleted
        ? "Calendar hearing information deleted successfully"
        : "Hearing info not found",
      data: { deleted },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "deleteHearingInfo",
      "Unable to delete hearing info at this time. Please try again.",
    );
  }
};

/**
 * Get calendar history, paginated and sorted
 */
export const getCalendarHistory = async (req, res) => {
  try {
    const {
      page: pageParam,
      limit: limitParam,
      isFrontendHistory,
      id,
      sortBy,
      sortOrder,
    } = req.body;
    const page = parseInt(pageParam) || 1;
    const limit = parseInt(limitParam) || 10;

    const { data, totalCount } = await calendarService.getCalendarHistoryList({
      page,
      limit,
      isFrontendHistory,
      id,
      sortBy,
      sortOrder,
    });

    return res.status(200).json({
      status: 200,
      message: "Calendar history fetched successfully",
      data,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getCalendarHistory",
      "Unable to fetch calendar history at this time. Please try again later.",
    );
  }
};
