// Single calendar's hearing info rows - fetch, judge/CMA/location/time
// resolved. Converted from PHP getHearingInfoAction / CalendarModel::
// hearingInfo + calendarDetails. Add/update/delete live in
// hearingInfoWriteService.js.
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_Calendar_Hearing_Info from "../../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import Cuttoffdate from "../../../../models/cuttoffdateModel.js";
import {
  CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
  CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
  HEARING_INFO_LIST_INCLUDE,
  HEARING_INFO_SORT_FIELD_MAP,
} from "../calendarSortConfig.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { toDisplayDate } from "./calendarHelpers.js";

// Shapes one v2_5_calendar_hearing_info row (loaded with HEARING_INFO_LIST_INCLUDE)
// into the judge/CMA/location/time-resolved wire format shared by getHearingInfo
// below and getDuplicateHearingDateReport (duplicateHearingDateService.js).
export const mapHearingInfoRow = (hr) => ({
  calendar_id: String(hr.calendarId),
  hearing_info_id: String(hr.id),
  judge_id: String(hr.judgeId),
  cma_id: String(hr.cmaId),
  time_id: String(hr.timeId),
  court_location_id:
    hr.courtLocationId != null ? String(hr.courtLocationId) : null,
  hearing_date: hr.hearingDate,
  hearingDate: toDisplayDate(hr.hearingDate),
  cutoff_date: hr.cutoffDate,
  cutoffDate: toDisplayDate(hr.cutoffDate),
  no_of_cases: hr.noOfCases,
  hearingtime: hr.hearingTime?.hearingTime || null,
  court_location: hr.courtLocation?.locationName || null,
  cma: hr.cma ? `${hr.cma.lastName}, ${hr.cma.firstName}` : null,
  judge: hr.judge ? `${hr.judge.lastName}, ${hr.judge.firstName}` : null,
});

/**
 * Get a single calendar's hearing info rows (judge/CMA/location/time
 * resolved), paginated and sorted. Converted from PHP getHearingInfoAction /
 * CalendarModel::hearingInfo + calendarDetails.
 * @returns {{calendar: Object|null, hearingInfoList: Array, hearingInfoTotal: number}}
 */
export const getHearingInfo = async ({
  calendarId,
  condition = {},
  page,
  limit,
  sortBy,
  sortOrder,
}) => {
  if (!calendarId) {
    throw new CalendarServiceError(400, "calendar_id is required");
  }

  const calendarRecord = await V2_5_Calendar.findByPk(parseInt(calendarId), {
    attributes: ["id", "circuitId", "caseTypeGroupId"],
    include: [
      CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
      CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
    ],
  });

  if (!calendarRecord) {
    return { calendar: null, hearingInfoList: [], hearingInfoTotal: 0 };
  }

  // Mirrors PHP CalendarModel::calendarDetails() - looks up the cutoff-days
  // config for this calendar's case-type group (cuttoffdate.casetype_groupid),
  // falling back to 20 when no row matches, same as the legacy default.
  let cutOffDays = 20;
  if (calendarRecord.caseTypeGroupId) {
    const cutoffRow = await Cuttoffdate.findOne({
      attributes: ["cutoffDaysDifference"],
      where: { casetypeGroupId: calendarRecord.caseTypeGroupId },
    });
    if (cutoffRow?.cutoffDaysDifference != null) {
      cutOffDays = cutoffRow.cutoffDaysDifference;
    }
  }

  const where = { calendarId: parseInt(calendarId) };
  if (condition.judge_id) where.judgeId = condition.judge_id;
  if (condition.cma_id) where.cmaId = condition.cma_id;

  const offset = (page - 1) * limit;
  const sortDirection = sortOrder === "desc" ? "DESC" : "ASC";
  const sortField = HEARING_INFO_SORT_FIELD_MAP[sortBy];
  const order = sortField
    ? [[...sortField, sortDirection]]
    : [["hearingDate", "DESC"]];

  const { count, rows } = await V2_5_Calendar_Hearing_Info.findAndCountAll({
    where,
    include: HEARING_INFO_LIST_INCLUDE,
    order,
    limit,
    offset,
  });

  const hearingInfoList = rows.map(mapHearingInfoRow);

  return {
    calendar: {
      circuitId: calendarRecord.circuitId,
      casetypeGroupId: calendarRecord.caseTypeGroupId,
      circuit: calendarRecord.circuit?.name || null,
      casetypeGroup: calendarRecord.casetypeGroupInfo?.casetypegroup || null,
      cutOffDays,
    },
    hearingInfoList,
    hearingInfoTotal: count,
  };
};
