import * as checkinCalendarListService from "./services/checkinCalendarListService.js";
import * as checkinStartCheckinService from "./services/checkinStartCheckinService.js";
import * as checkinInfoListService from "./services/checkinInfoListService.js";
import * as checkinInfoExportService from "./services/checkinInfoExportService.js";
import * as checkinNotesService from "./services/checkinNotesService.js";
import * as checkinAttendanceStatusService from "./services/checkinAttendanceStatusService.js";
import * as checkinPartiesService from "./services/checkinPartiesService.js";
import { CalendarServiceError } from "./services/calendarServiceError.js";
import { todayDateOnly } from "./services/checkinSharedHelpers.js";
import { broadcastAttendanceStatusUpdated } from "../../../websocket/checkinBroadcast.js";
import { logger } from "../../../../config/winstonLogger.js";

// Kept separate from adminCalendarController.js - this file is the
// Check-In tab's own domain (today's docket cases grouped by judge), not
// the v2.5 calendar-scheduling CRUD the rest of adminCalendarController.js
// covers, even though both are mounted under the /calendar route.
const respondError = (res, error, context, fallbackMessage) => {
  const isExpected = error instanceof CalendarServiceError;
  logger[isExpected ? "warn" : "error"](`[${context}]`, error);
  const status = isExpected ? error.status : 500;
  const message = isExpected ? error.message : fallbackMessage;
  return res.status(status).json({ status, message, success: false });
};

/**
 * Get today's Check-In calendar list - docket cases with a hearing today or
 * already in the check-in queue today, filtered by hearing location/county
 * circuit/casetype/judge/CMA and grouped by judge. Powers CheckInTab's
 * search.
 */
export const getListOfTodaysCalendars = async (req, res) => {
  try {
    const { searchData = {}, searchCondition = {} } = req.body;

    const data = await checkinCalendarListService.getListOfTodaysCalendars({
      searchData,
      searchCondition,
    });

    return res.status(200).json({
      status: 200,
      message: "Today's check-in calendar list fetched successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getListOfTodaysCalendars",
      "Unable to fetch today's check-in calendar list at this time. Please try again.",
    );
  }
};

/**
 * Start check-in for a judge - upserts that judge's today's docket cases
 * into checkin_calendar_today_date with start_checkin = 1. Powers
 * CheckInTab's "Start Check-in" / "Continue Check-in" button.
 */
export const saveStartCheckinCalendar = async (req, res) => {
  try {
    const { judge_userid: judgeUserId } = req.body;
    const modifiedBy = req.userId;

    const data = await checkinStartCheckinService.saveStartCheckinCalendar({
      judgeUserId,
      modifiedBy,
    });

    return res.status(200).json({
      status: 200,
      message:
        data.checkedInCount > 0
          ? "Check-in started successfully"
          : "No cases found to check in for today",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "saveStartCheckinCalendar",
      "Unable to start check-in at this time. Please try again.",
    );
  }
};

/**
 * Get a judge's Check-In Info list - the per-case attendance grid for
 * today's checked-in dockets. Powers CheckInInfoPage, reached from
 * CheckInTab's "Start Check-in" / "Continue Check-in" button once
 * saveStartCheckinCalendar has populated checkin_calendar_today_date.
 */
export const listStartCheckinInfoCalendar = async (req, res) => {
  try {
    const { data = {}, searchCondition = {} } = req.body;
    const {
      judge_userid: judgeUserId,
      hearingTime,
      party_lastname: partyLastName,
      party_firstname: partyFirstName,
      advanceFilter,
    } = data;

    const result = await checkinInfoListService.listStartCheckinInfoCalendar({
      judgeUserId,
      hearingTime,
      partyLastName,
      partyFirstName,
      advanceFilter,
      searchCondition,
    });

    return res.status(200).json({
      status: 200,
      message: "Check-in info list fetched successfully",
      data: result,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "listStartCheckinInfoCalendar",
      "Unable to fetch check-in info at this time. Please try again.",
    );
  }
};

/**
 * Export a judge's Check-In Info list as CSV - CheckInInfoPage's "Export as
 * CSV" menu action. Unlike listStartCheckinInfoCalendar above, this covers
 * every docket checked in for this judge today (checkin_calendar_today_date,
 * hearing_date = today) across every hearing-time tab, ignoring whatever
 * search/filters/tab are currently applied on screen, and its own wider
 * column set - see checkinInfoExportService.js's header comment.
 */
export const exportCheckinInfoList = async (req, res) => {
  try {
    const { judge_userid: judgeUserId } = req.body;

    const csvData = await checkinInfoExportService.exportCheckinInfoList({ judgeUserId });
    if (!csvData) {
      return res
        .status(404)
        .json({ status: 404, message: "No check-in records found for this judge today", success: false });
    }

    const filename = `checkin-info-${todayDateOnly()}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvData);
  } catch (error) {
    return respondError(
      res,
      error,
      "exportCheckinInfoList",
      "Unable to export check-in info at this time. Please try again.",
    );
  }
};

/**
 * Save the Notes field for a checked-in docket - updates
 * checkin_calendar_today_date.notes and logs the change to history. Powers
 * CheckInInfoPage's "Editing" panel Save Changes button.
 */
export const saveCheckinNotes = async (req, res) => {
  try {
    const { id, notes } = req.body;
    const modifiedBy = req.userId;

    const data = await checkinNotesService.saveCheckinNotes({ id, notes, modifiedBy });

    return res.status(200).json({
      status: 200,
      message: "Notes saved successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "saveCheckinNotes",
      "Unable to save notes at this time. Please try again.",
    );
  }
};

// result -> user-facing message for updateAttendanceStatus's non-500
// outcomes (see checkinAttendanceStatusService.js's inferred-branches note).
const ATTENDANCE_STATUS_RESULT_MESSAGE = {
  1: "Attendance status updated successfully",
  partyError: "Cannot update attendance status until a party has checked in for this docket",
  revertPartyError: "Cannot revert to Hearing Scheduled after a party has already checked in",
  0: "No change made",
};

/**
 * Update a checked-in docket's attendance status (Hearing Scheduled ->
 * Partially Arrived -> Arrived -> Ready for Hearing), guarded by whether any
 * party has already checked in today. Powers CheckInInfoPage's Attendance
 * dropdown (handleAttendanceChange).
 */
export const updateAttendanceStatus = async (req, res) => {
  try {
    const { startCheckinDocketData, status } = req.body;
    const modifiedBy = req.userId;

    const data = await checkinAttendanceStatusService.updateAttendanceStatus({
      startCheckinDocketData,
      status,
      modifiedBy,
    });

    // Only broadcast on an actual change - a blocked transition (no party
    // checked in yet / reverting after one has) leaves the row untouched,
    // so nobody else's grid needs to refresh.
    if (data.result === 1) {
      broadcastAttendanceStatusUpdated({
        docketCaseId: data.docketCaseId,
        attendanceStatus: data.attendanceStatus,
      });
    }

    return res.status(200).json({
      status: 200,
      message: ATTENDANCE_STATUS_RESULT_MESSAGE[data.result] ?? "Attendance status update processed",
      data,
      success: data.result === 1,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "updateAttendanceStatus",
      "Unable to update attendance status at this time. Please try again.",
    );
  }
};

/**
 * Check in (or undo check-in for) a single party on a docket - Case Name /
 * Petitioner Attorney / Respondent Attorney / Case Official cells on
 * CheckInInfoPage. Also cascades the check-in across this same party's
 * other dockets today for the same judge/hearing time, and recomputes this
 * docket's attendance status. Powers checkInInfoColumns.jsx's
 * onPartyCheckinClick.
 */
export const updateCheckinParties = async (req, res) => {
  try {
    const { startCheckinDocketData, partyName, partyTypeContact, status } = req.body;
    const modifiedBy = req.userId;

    const data = await checkinPartiesService.updateCheckinParties({
      startCheckinDocketData,
      partyName,
      partyTypeContact,
      status,
      modifiedBy,
    });

    broadcastAttendanceStatusUpdated({
      docketCaseId: data.docketCaseId,
      partyName: data.partyName,
      status: data.status,
    });

    return res.status(200).json({
      status: 200,
      message: data.status === "1" ? "Checked in successfully" : "Check-in undone successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "updateCheckinParties",
      "Unable to update check-in at this time. Please try again.",
    );
  }
};
