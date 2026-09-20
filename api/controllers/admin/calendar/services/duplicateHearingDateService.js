// Hearing-date scheduling-conflict checks: quick invalid/max-cases flags
// before saving, and the detailed "who else is scheduled" report. Converted
// from PHP checkDuplicateHearingDateAction / getDuplicateHearingDateAction /
// CalendarModel::duplicateHearingDateQuery.
import { Op } from "sequelize";
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../../../../models/admin/v2_5_calendarCasetypeModel.js";
import V2_5_Calendar_Hearing_Info from "../../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import V2_5_CountyCircuitMap from "../../../../models/admin/v2_5_countyCircuitMapModel.js";
import { HEARING_INFO_LIST_INCLUDE } from "../calendarSortConfig.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { getCalendarDetails, toIsoDate } from "./calendarHelpers.js";
import { mapHearingInfoRow } from "./hearingInfoService.js";

/**
 * Resolves every calendar id that shares a (county, casetype) combination
 * with the given calendar - i.e. the set of calendars a hearing-date
 * conflict check must look across, not just the calendar itself. Mirrors
 * the county/circuit/casetype resolution already used by
 * validateCountyCasetypeCombination (calendarCrudService.js).
 */
const resolveRelatedCalendarIds = async (calendarId) => {
  const calendar = await V2_5_Calendar.findByPk(parseInt(calendarId), {
    attributes: ["id", "circuitId"],
  });
  if (!calendar) return [];

  const casetypeLinks = await V2_5_CalendarCasetype.findAll({
    where: { calendarId: parseInt(calendarId) },
    attributes: ["caseTypeId"],
    raw: true,
  });
  const casetypeIds = casetypeLinks.map((link) => link.caseTypeId);
  if (casetypeIds.length === 0) return [];

  const countyMappings = await V2_5_CountyCircuitMap.findAll({
    where: { circuitId: calendar.circuitId },
    attributes: ["countyId"],
    raw: true,
  });
  const countyIds = countyMappings.map((mapping) => mapping.countyId);
  if (countyIds.length === 0) return [];

  const relatedCircuitMappings = await V2_5_CountyCircuitMap.findAll({
    where: { countyId: { [Op.in]: countyIds } },
    attributes: ["circuitId"],
    raw: true,
  });
  const relatedCircuitIds = [
    ...new Set(relatedCircuitMappings.map((mapping) => mapping.circuitId)),
  ];

  const matches = await V2_5_CalendarCasetype.findAll({
    where: { caseTypeId: { [Op.in]: casetypeIds } },
    include: [
      {
        model: V2_5_Calendar,
        as: "calendar",
        required: true,
        where: { circuitId: { [Op.in]: relatedCircuitIds } },
        attributes: ["id"],
      },
    ],
    attributes: ["calendarId"],
    raw: true,
  });

  return [...new Set(matches.map((match) => match.calendarId))];
};

/**
 * For one candidate hearing date, checks (a) whether a hearing already
 * exists at that exact time/date for a calendar sharing this calendar's
 * (county, casetype) grouping (isHearingDateTimeInvalid), and (b) whether
 * any other hearing that day, for that same grouping, requires a "max
 * number of cases" cap (maxCasesFlag). Converted from PHP
 * duplicateHearingDateQuery (queryFlag 0 then 1).
 *
 * maxCasesFlag is tri-state, matching the legacy return values: `false`
 * when no same-day hearing exists for the grouping, `1` when at least one
 * of those hearings has a later time slot that day (cap needed on this
 * earlier hearing so it doesn't run long and collide), `2` when matches
 * exist but none are later (legacy PHP comments this "not required", but
 * the old UI still surfaces a message for it - see checkDuplicateHearingDate).
 *
 * excludeHearingInfoId is the hearing_info row currently being edited (if
 * any) - without it, re-checking a row against its own already-saved
 * date/time would find itself and report a false conflict.
 */
const checkDuplicateForDate = async (
  calendarId,
  timeId,
  hearingDateIso,
  excludeHearingInfoId,
) => {
  const relatedCalendarIds = await resolveRelatedCalendarIds(calendarId);
  if (relatedCalendarIds.length === 0) {
    return { isHearingDateTimeInvalid: false, maxCasesFlag: false };
  }

  const selfExclusion = excludeHearingInfoId
    ? { id: { [Op.ne]: parseInt(excludeHearingInfoId) } }
    : {};

  const exactMatch = await V2_5_Calendar_Hearing_Info.findOne({
    where: {
      calendarId: { [Op.in]: relatedCalendarIds },
      timeId: parseInt(timeId),
      hearingDate: hearingDateIso,
      ...selfExclusion,
    },
    attributes: ["id"],
  });
  const isHearingDateTimeInvalid = Boolean(exactMatch);

  let maxCasesFlag = false;
  if (!isHearingDateTimeInvalid) {
    const sameDayHearings = await V2_5_Calendar_Hearing_Info.findAll({
      where: {
        calendarId: { [Op.in]: relatedCalendarIds },
        hearingDate: hearingDateIso,
        ...selfExclusion,
      },
      attributes: ["timeId"],
      raw: true,
    });

    if (sameDayHearings.length > 0) {
      const hasLaterSlot = sameDayHearings.some(
        (hearing) => hearing.timeId > parseInt(timeId),
      );
      maxCasesFlag = hasLaterSlot ? 1 : 2;
    }
  }

  return { isHearingDateTimeInvalid, maxCasesFlag };
};

/**
 * Checks one or more candidate hearing dates for scheduling conflicts before
 * update-hearing-info is submitted. Converted from PHP
 * checkDuplicateHearingDateAction / checkDuplicateHearingDateArray.
 *
 * Always returns results keyed by hearingDate string (e.g.
 * {"08-04-2026": {isHearingDateTimeInvalid, maxCasesFlag}}), matching the
 * legacy portal's response shape for both the single-date and datesList
 * call forms.
 */
export const checkDuplicateHearingDate = async ({
  calendarId,
  timeId,
  hearingDate,
  datesList,
  hearingInfoId,
}) => {
  if (!calendarId || !timeId) {
    throw new CalendarServiceError(
      400,
      "calendarId and timeId are required",
    );
  }

  if (hearingDate) {
    return {
      [hearingDate]: await checkDuplicateForDate(
        calendarId,
        timeId,
        toIsoDate(hearingDate),
        hearingInfoId,
      ),
    };
  }

  if (!Array.isArray(datesList) || datesList.length === 0) {
    throw new CalendarServiceError(
      400,
      "hearingDate or datesList is required",
    );
  }

  const results = {};
  for (const date of datesList) {
    if (!date?.hearingDate) continue;
    results[date.hearingDate] = await checkDuplicateForDate(
      calendarId,
      timeId,
      toIsoDate(date.hearingDate),
      hearingInfoId,
    );
  }

  return results;
};

/**
 * Detailed "who else is scheduled" report for a hearing-date conflict -
 * every hearing on that date, across calendars sharing this calendar's
 * (county, casetype) grouping, grouped by calendar with judge/CMA/location/
 * time names resolved. Converted from PHP getDuplicateHearingDateAction /
 * CalendarModel::getDuplicateHearingDate (duplicateHearingDateQuery
 * queryFlag=2) - powers the "View hearing date report." link shown
 * alongside the checkDuplicateHearingDate conflict messages.
 *
 * Uses the date-only filter (like maxCasesFlag, not the exact time+date
 * filter used by isHearingDateTimeInvalid) so the report is useful for all
 * three link-bearing messages, not just an exact-slot collision. timeId is
 * only used to flag which row(s) match the time the user actually picked.
 *
 * @returns {Object} keyed by calendarId, e.g.
 *   { "140": { calendarId, calendarDetails: {circuit, casetypeGroup}, hearingInfoList: [...] } }
 */
export const getDuplicateHearingDateReport = async ({
  calendarId,
  timeId,
  hearingDate,
}) => {
  if (!calendarId || !hearingDate) {
    throw new CalendarServiceError(
      400,
      "calendarId and hearingDate are required",
    );
  }

  const relatedCalendarIds = await resolveRelatedCalendarIds(calendarId);
  if (relatedCalendarIds.length === 0) {
    return {};
  }

  const rows = await V2_5_Calendar_Hearing_Info.findAll({
    where: {
      calendarId: { [Op.in]: relatedCalendarIds },
      hearingDate: toIsoDate(hearingDate),
    },
    include: HEARING_INFO_LIST_INCLUDE,
    order: [
      ["calendarId", "ASC"],
      ["timeId", "ASC"],
    ],
  });

  const report = {};
  for (const row of rows) {
    const key = String(row.calendarId);

    if (!report[key]) {
      const calDetails = await getCalendarDetails(row.calendarId);
      report[key] = {
        calendarId: row.calendarId,
        calendarDetails: calDetails?.calendarDetails || null,
        hearingInfoList: [],
      };
    }

    report[key].hearingInfoList.push({
      ...mapHearingInfoRow(row),
      isRequestedTime: timeId ? String(row.timeId) === String(timeId) : false,
    });
  }

  return report;
};
