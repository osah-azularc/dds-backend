import * as pastCalendarListService from "./services/pastCalendarListService.js";
import * as pastCheckinInfoListService from "./services/pastCheckinInfoListService.js";
import { CalendarServiceError } from "./services/calendarServiceError.js";
import { logger } from "../../../../config/winstonLogger.js";

// Kept separate from adminCalendarController.js / adminCalendarCheckinController.js -
// this file is the Past Calendar tab's own domain (historical docket hearings
// grouped by hearing date/judge), not the v2.5 calendar-scheduling CRUD or the
// Check-In tab's "today" queue, even though all three are mounted under the
// /calendar route.
const respondError = (res, error, context, fallbackMessage) => {
  const isExpected = error instanceof CalendarServiceError;
  logger[isExpected ? "warn" : "error"](`[${context}]`, error);
  const status = isExpected ? error.status : 500;
  const message = isExpected ? error.message : fallbackMessage;
  return res.status(status).json({ status, message, success: false });
};

/**
 * Get the Past Calendar search list - past docket hearings filtered by
 * hearing date/hearing location/county circuit/casetype/judge/CMA and
 * grouped by (hearing date, judge). Powers the Calendar > Past tab's search.
 * Requires at least one searchData filter (enforced in the service, not just
 * client-side).
 */
export const getListOfPastCalendars = async (req, res) => {
  try {
    const { searchData = {}, searchCondition = {} } = req.body;

    const data = await pastCalendarListService.getListOfPastCalendars({
      searchData,
      searchCondition,
    });

    // Nested under `data` (list/total/firstRecord/lastRecord together),
    // matching every other controller's response envelope in this codebase
    // (getUpcomingCalendarData, getListOfTodaysCalendars, ...) rather than
    // the legacy endpoint's flat top-level shape - flagged in the PR/task
    // notes since the spec described list/total/firstRecord/lastRecord as
    // top-level fields.
    return res.status(200).json({
      status: 200,
      message: "Past calendar list fetched successfully",
      data,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getListOfPastCalendars",
      "Unable to fetch the past calendar list at this time. Please try again.",
    );
  }
};

/**
 * Get a judge's Past Calendar "View Check-in" list - the read-only per-case
 * attendance grid for a judge's already-completed check-in on a past
 * hearing date. Powers PastCalendarInfoPage, reached from
 * PastCalendarsTab's "View Check-in" button.
 */
export const getListOfPastCheckinInfo = async (req, res) => {
  try {
    const { data = {}, searchCondition = {} } = req.body;
    const {
      judge_userid: judgeUserId,
      hearing_date: hearingDate,
      hearingTime,
      party_lastname: partyLastName,
      party_firstname: partyFirstName,
      advanceFilter,
    } = data;

    const result = await pastCheckinInfoListService.listPastCheckinInfoCalendar({
      judgeUserId,
      hearingDate,
      hearingTime,
      partyLastName,
      partyFirstName,
      advanceFilter,
      searchCondition,
    });

    return res.status(200).json({
      status: 200,
      message: "Past check-in info list fetched successfully",
      data: result,
      success: true,
    });
  } catch (error) {
    return respondError(
      res,
      error,
      "getListOfPastCheckinInfo",
      "Unable to fetch the past check-in info at this time. Please try again.",
    );
  }
};
