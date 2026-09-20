// Add/update/delete a calendar's hearing info row(s). Converted from PHP
// updateHearingInfoAction / CalendarModel::hasDataChanged + deleteHearingInfoAction.
// Read/list lives in hearingInfoService.js.
import V2_5_Calendar_Hearing_Info from "../../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import { HEARING_INFO_LIST_INCLUDE } from "../calendarSortConfig.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import {
  toDisplayDate,
  toIsoDate,
  updateCalendarHistory,
} from "./calendarHelpers.js";

// Fixed field order for the "<b>Judge:</b> x, <b>CMA:</b> y, ..." summary
// line shared by the added/updated history descriptions below.
const HEARING_INFO_FIELDS = [
  { key: "judge", label: "Judge" },
  { key: "cma", label: "CMA" },
  { key: "hearingtime", label: "Time" },
  { key: "courtLocation", label: "Location" },
  { key: "noOfCases", label: "Max Cases" },
  { key: "hearingDate", label: "Hearing Date" },
  { key: "cutoffDate", label: "Cutoff Date" },
];

// Builds the "<b>Judge:</b> x, <b>CMA:</b> y, ..." summary line. `onlyKeys`
// restricts it to a subset of HEARING_INFO_FIELDS - the update path passes
// only the fields that actually changed (matching the legacy portal's
// hasDataChanged behavior), instead of dumping every field on every save.
const describeHearingInfo = (values, onlyKeys = null) =>
  HEARING_INFO_FIELDS.filter(({ key }) => !onlyKeys || onlyKeys.includes(key))
    .map(({ key, label }) => `<b>${label}:</b> ${values[key] ?? ""}`)
    .join(", ");

/**
 * Add or update a calendar's hearing info row(s) (judge/CMA/time/location +
 * one or more hearing dates). Converted from PHP updateHearingInfoAction /
 * CalendarModel::hasDataChanged + updateCalendarHistory.
 *
 * hearingInfo carries both the FK ids to persist (judge_id, cma_id, time_id,
 * court_location_id, no_of_cases, calendar_id[, hearing_info_id]) and
 * display-only resolved names (hearingtime, court_location, cma, judge),
 * used only for the audit description below - never written to the DB,
 * matching the legacy PHP behavior of stripping them before the query.
 *
 * @returns {{hearingInfoIds: number[], isUpdate: boolean}}
 */
export const saveHearingInfo = async ({
  hearingInfo = {},
  datesList = [],
  modifiedBy,
}) => {
  const {
    hearing_info_id: hearingInfoId,
    judge_id: judgeId,
    cma_id: cmaId,
    time_id: timeId,
    court_location_id: courtLocationId,
    no_of_cases: noOfCases,
    calendar_id: calendarId,
    // Display-only - resolved via joins on read, never persisted here.
    hearingtime: hearingTimeDisplay,
    court_location: courtLocationDisplay,
    cma: cmaDisplay,
    judge: judgeDisplay,
  } = hearingInfo;

  if (!calendarId || !judgeId || !cmaId || !timeId) {
    throw new CalendarServiceError(
      400,
      "calendar_id, judge_id, cma_id, and time_id are required",
    );
  }

  if (!Array.isArray(datesList) || datesList.length === 0) {
    throw new CalendarServiceError(
      400,
      "At least one hearing date is required",
    );
  }

  const sharedFields = {
    judgeId: parseInt(judgeId),
    cmaId: parseInt(cmaId),
    timeId: parseInt(timeId),
    courtLocationId: courtLocationId != null ? parseInt(courtLocationId) : null,
    noOfCases:
      noOfCases != null && noOfCases !== "" ? parseInt(noOfCases) : null,
    calendarId: parseInt(calendarId),
  };

  if (hearingInfoId) {
    // UPDATE path - a single existing row, so only the first date applies.
    const oldRow = await V2_5_Calendar_Hearing_Info.findByPk(
      parseInt(hearingInfoId),
      { include: HEARING_INFO_LIST_INCLUDE },
    );

    if (!oldRow) {
      throw new CalendarServiceError(404, "Hearing info not found");
    }

    const [{ hearingDate, cutoffDate } = {}] = datesList;

    const newValues = {
      judge: judgeDisplay,
      cma: cmaDisplay,
      hearingtime: hearingTimeDisplay,
      courtLocation: courtLocationDisplay,
      noOfCases: sharedFields.noOfCases,
      hearingDate,
      cutoffDate,
    };
    const oldValues = {
      judge: oldRow.judge
        ? `${oldRow.judge.lastName}, ${oldRow.judge.firstName}`
        : null,
      cma: oldRow.cma
        ? `${oldRow.cma.lastName}, ${oldRow.cma.firstName}`
        : null,
      hearingtime: oldRow.hearingTime?.hearingTime ?? null,
      courtLocation: oldRow.courtLocation?.locationName ?? null,
      noOfCases: oldRow.noOfCases,
      hearingDate: toDisplayDate(oldRow.hearingDate),
      cutoffDate: toDisplayDate(oldRow.cutoffDate),
    };

    // Only the fields that actually changed go into the history entry -
    // matches the legacy portal's hasDataChanged check instead of dumping
    // every field, changed or not, on every save. Values are compared as
    // strings (both sides may be numbers, null, or undefined).
    const changedKeys = HEARING_INFO_FIELDS.map(({ key }) => key).filter(
      (key) => String(newValues[key] ?? "") !== String(oldValues[key] ?? ""),
    );

    await V2_5_Calendar_Hearing_Info.update(
      {
        ...sharedFields,
        hearingDate: toIsoDate(hearingDate),
        cutoffDate: toIsoDate(cutoffDate),
      },
      { where: { id: parseInt(hearingInfoId) } },
    );

    if (changedKeys.length > 0) {
      const historyDescription = `<p>The following calendar hearing info has been updated:</p>
      <p>${describeHearingInfo(newValues, changedKeys)}</p>
      <p class="history-title"><b>Original hearing info:</b></p>
      <p>${describeHearingInfo(oldValues, changedKeys)}</p>`;

      await updateCalendarHistory(historyDescription, calendarId, modifiedBy);
    }

    return { hearingInfoIds: [parseInt(hearingInfoId)], isUpdate: true };
  }

  // INSERT path - one row per date, all sharing the same judge/CMA/time/location.
  const newRows = await V2_5_Calendar_Hearing_Info.bulkCreate(
    datesList.map((date) => ({
      ...sharedFields,
      hearingDate: toIsoDate(date.hearingDate),
      cutoffDate: toIsoDate(date.cutoffDate),
    })),
  );

  const datesSummary = datesList
    .map((date) => date.hearingDate)
    .filter(Boolean)
    .join(", ");

  const historyDescription = `<p>The following calendar hearing info has been added:</p>
      <p>${describeHearingInfo(
        {
          judge: judgeDisplay,
          cma: cmaDisplay,
          hearingtime: hearingTimeDisplay,
          courtLocation: courtLocationDisplay,
          noOfCases: sharedFields.noOfCases,
        },
        ["judge", "cma", "hearingtime", "courtLocation", "noOfCases"],
      )}, <b>Hearing Date(s):</b> ${datesSummary}</p>`;

  await updateCalendarHistory(historyDescription, calendarId, modifiedBy);

  return { hearingInfoIds: newRows.map((row) => row.id), isUpdate: false };
};

/**
 * Delete a single hearing-info row and log an audit entry describing what
 * was removed. Converted from PHP deleteHearingInfoAction. The payload's
 * display fields (judge, cma, court_location, hearingtime, no_of_cases,
 * hearingDate) are echoes of the grid row the user clicked delete on - used
 * only for the audit description below, never re-queried; only
 * hearing_info_id drives the actual delete.
 * @returns {boolean} whether a row was actually deleted
 */
export const deleteHearingInfo = async ({
  hearing_info_id: hearingInfoId,
  calendar_id: calendarId,
  judge,
  cma,
  court_location: courtLocation,
  hearingtime: hearingTime,
  no_of_cases: noOfCases,
  hearingDate,
  modifiedBy,
}) => {
  if (!hearingInfoId || !calendarId) {
    throw new CalendarServiceError(
      400,
      "hearing_info_id and calendar_id are required",
    );
  }

  const deletedCount = await V2_5_Calendar_Hearing_Info.destroy({
    where: { id: parseInt(hearingInfoId) },
  });

  const historyDescription = `<p>The following calendar hearing information has been removed:</p>
      <p>
        <b>Judge:</b> ${judge || ""},
        <b>Judge Assistant:</b> ${cma || ""},
        <b>Hearing Location:</b> ${courtLocation || ""},
        <b>Hearing Time:</b> ${hearingTime || ""},
        <b>Max # of Cases:</b> ${noOfCases ?? ""},
        <b>Hearing Date:</b> ${hearingDate || ""}
      </p>`;

  await updateCalendarHistory(historyDescription, calendarId, modifiedBy);

  return deletedCount > 0;
};
