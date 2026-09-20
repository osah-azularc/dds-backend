// Past Calendar "View Check-in" list - the read-only per-case attendance
// grid for a judge's already-completed check-in on a past hearing date,
// reached from PastCalendarsTab's "View Check-in" button
// (PastCalendarInfoPage.jsx). Converted from PHP
// OsahPastCalenderController::listPastStartCheckinInfoCalendarAction /
// OsahPastCalendarModel::{getPastStartCheckinCalendarTimeData,
// listPastStartCheckinInfoCalendar} - queries the dedicated archived
// checkin_calendar_past_date / attendance_status_past_date tables (verified
// to exist and hold real ported data), NOT checkin_calendar_today_date -
// this is a genuinely separate table/query from today's Check-In Info list
// (checkinInfoListService.js), not the same table filtered by an older date.
//
// Ported using the same batch-fetch-then-Map-join style as
// checkinInfoListService.js's listStartCheckinInfoCalendar (not literal SQL
// joins/correlated EXISTS subqueries - see that file's own header for why),
// scoped to exactly the tables the ported spec named: checkin_calendar_past_date
// (primary), attendance_status_master, judge_assistant_clerk (joined twice -
// once for judge, once for cma), attendance_status_past_date (per-party
// checkin flags). Deviations worth flagging:
//   - No `docket` table join (not in the ported table list): checkin_calendar_past_date's
//     own frozen docket_status is used as-is - this is a historical snapshot
//     view, so showing today's live docket.status for a hearing from months
//     ago would misrepresent what the docket's status was at that hearing.
//     docketNumber isn't available either (it came from that same docket
//     join) - not a loss, since the grid's "Docket #" column already
//     displays docketCaseId, not docketNumber (checkInInfoColumns.jsx).
//   - judge_id/cma resolved against *all* judge_assistant_clerk rows, not
//     just currently-active ones - mirrors pastCalendarListService.js's own
//     reasoning: a past hearing can reference a judge/CMA who has since been
//     deactivated.
//   - No decision_automation_report/peopledetails lookups
//     (previousContinuanceHearingDate/caseNameContactType) - not in the
//     ported table list, and neither is rendered by the read-only grid
//     (caseNameContactType only ever mattered for the *today* grid's
//     checkin-click party-type resolution, which this page doesn't have).
//   - advanceFilter.docketStatusDateUpdate (FiltersButton's shared "Docket
//     Status Updates" section) is a no-op here - there's no
//     docket_status_updated_today equivalent on checkin_calendar_past_date,
//     so that filter category is simply never applied.
import { Op } from "sequelize";
import CheckinCalendarPastDate from "../../../../models/CheckinCalendarPastDate.js";
import AttendanceStatusPastDate from "../../../../models/AttendanceStatusPastDate.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import AttendanceStatusMaster from "../../../../models/AttendanceStatusMaster.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { formatStaffConcat } from "./checkinSharedHelpers.js";
import { parsePagination } from "../../../../helpers/reviewForm1/paginationHelper.js";
import {
  judgeDisplayName,
  formatTime12h,
  ORDERBY_FIELD_MAP,
  matchesFilterCategory,
  sanitizePartyDisplayValue,
  matchesPartyName,
  compareValues,
} from "./checkinInfoListHelpers.js";

/**
 * Resolves the judge's display name and the hearing time to list for a past
 * hearing date, mirroring getPastStartCheckinCalendarTimeData - a
 * caller-supplied hearingTime is used as-is, otherwise the earliest
 * distinct hearing_time archived for this judge/date is used as the
 * default. Unlike checkinInfoListHelpers.js's resolveHearingContext, the
 * judge lookup isn't restricted to isActive='1' - see this file's header.
 */
const resolvePastHearingContext = async ({ judgeUserId, hearingDate, requestedHearingTime }) => {
  const judge = await JudgeAssistantClerk.findOne({
    where: { userId: judgeUserId, userType: "judge" },
  });
  if (!judge) {
    throw new CalendarServiceError(404, "Judge not found");
  }

  // Distinct hearing_time values are deduped in JS below rather than via a
  // DB-level GROUP BY - same reasoning as resolveHearingContext.
  const checkedInRows = await CheckinCalendarPastDate.findAll({
    where: { judgeId: judgeUserId, hearingDate, activePastCalendar: "1" },
    attributes: ["hearingTime"],
    raw: true,
  });
  if (!checkedInRows.length) {
    throw new CalendarServiceError(
      404,
      "No check-in records found for this judge on the selected date.",
    );
  }

  const distinctTimes = [...new Set(checkedInRows.map((r) => r.hearingTime).filter(Boolean))].sort();
  const hearingTime =
    requestedHearingTime && distinctTimes.includes(requestedHearingTime)
      ? requestedHearingTime
      : distinctTimes[0];

  const timeData = Object.fromEntries(distinctTimes.map((t) => [t, formatTime12h(t)]));

  return { hearingJudgesName: judgeDisplayName(judge), hearingTime, timeData };
};

export const listPastCheckinInfoCalendar = async ({
  judgeUserId,
  hearingDate,
  hearingTime: requestedHearingTime,
  partyLastName,
  partyFirstName,
  advanceFilter = {},
  searchCondition = {},
} = {}) => {
  if (!judgeUserId) {
    throw new CalendarServiceError(400, "judge_userid is required");
  }
  if (!hearingDate) {
    throw new CalendarServiceError(400, "hearing_date is required");
  }

  const { hearingJudgesName, hearingTime, timeData } = await resolvePastHearingContext({
    judgeUserId,
    hearingDate,
    requestedHearingTime,
  });

  const checkinRows = await CheckinCalendarPastDate.findAll({
    where: { judgeId: judgeUserId, hearingDate, activePastCalendar: "1", hearingTime },
    raw: true,
  });

  if (!checkinRows.length) {
    return {
      checkinDate: hearingDate,
      hearingJudgesName,
      hearingTime,
      timeData,
      list: [],
      total: [{ total: 0 }],
      firstRecord: 0,
      lastRecord: 0,
    };
  }

  const caseIds = checkinRows.map((row) => row.docketCaseId);

  // judge_assistant_clerk "joined twice" per the ported spec - once to
  // resolve judge_name's display name, once to validate cma - both against
  // every staff record (active or not), not just active ones.
  const [allJudges, allCmas, statusRows, attendancePastRows] = await Promise.all([
    JudgeAssistantClerk.findAll({
      where: { userType: "judge" },
      attributes: ["userId", "firstName", "lastName", "title"],
      raw: true,
    }),
    JudgeAssistantClerk.findAll({
      where: { userType: "cma" },
      attributes: ["userId", "firstName", "lastName"],
      raw: true,
    }),
    AttendanceStatusMaster.findAll({ attributes: ["status", "statusName"], raw: true }),
    AttendanceStatusPastDate.findAll({
      where: {
        docketCaseId: { [Op.in]: caseIds },
        hearingDate,
        hearingTime,
        attendanceStatus: "1",
      },
      attributes: ["docketCaseId", "partyName"],
      raw: true,
    }),
  ]);

  const judgeByConcat = new Map(allJudges.map((j) => [formatStaffConcat(j), j]));
  const cmaConcats = new Set(allCmas.map(formatStaffConcat));
  const statusNameByStatus = new Map(statusRows.map((s) => [s.status, s.statusName]));

  // attendance_status_past_date.partyname stores the actual party's name
  // (e.g. "SMITH, JOHN"), not a fixed role label - same convention as
  // attendance_status_today_date (checkinInfoListService.js). Each of the 4
  // *_checkin flags below is keyed by this row's own party name value.
  const checkedInPartySet = new Set(
    attendancePastRows.map((r) => `${r.docketCaseId}|${r.partyName}`),
  );
  const hasPartyCheckedIn = (caseId, partyNameValue) =>
    partyNameValue && checkedInPartySet.has(`${caseId}|${partyNameValue}`) ? "1" : "0";

  // Mirrors the legacy INNER JOINs to judge_assistant_clerk for both cma and
  // judge_name (must resolve to a staff record - active or not, see file
  // header) - rows failing either are dropped, same as an INNER JOIN would
  // drop them. No docket join/guard here (see file header).
  const list = checkinRows
    .filter((row) => {
      const judgeConcat = (row.judgeName || "").trim();
      const cmaConcat = (row.cma || "").trim();
      return judgeByConcat.has(judgeConcat) && cmaConcats.has(cmaConcat);
    })
    .map((row) => {
      const judge = judgeByConcat.get((row.judgeName || "").trim());

      return {
        id: row.id,
        docketCaseId: row.docketCaseId,
        caseName: sanitizePartyDisplayValue(row.caseName),
        caseType: row.caseType,
        caseTypeId: row.caseTypeId,
        agency: row.agency,
        county: row.county,
        circuitId: row.circuitId,
        hearingSite: row.hearingSite,
        hearingDate: row.hearingDate,
        hearingTime: row.hearingTime,
        judgeId: row.judgeId,
        judgeName: row.judgeName,
        judgeDisplayName: judgeDisplayName(judge),
        cma: row.cma,
        petitionerAttorney: sanitizePartyDisplayValue(row.petitionerAttorney),
        petOrRep: row.petOrRep,
        respondentAttorney: sanitizePartyDisplayValue(row.respondentAttorney),
        caseOfficial: sanitizePartyDisplayValue(row.caseOfficial),
        agencyReferenceNumber: row.agencyReferenceNumber,
        notes: row.notes,
        // Frozen snapshot (this row's own docket_status), not a live docket
        // lookup - see file header.
        docketStatus: row.docketStatus,
        attendanceStatus: row.attendanceStatus,
        statusName: statusNameByStatus.get(row.attendanceStatus) ?? null,
        // "status0" -> "status1" etc - matches checkinInfoListService.js's
        // same status_wise_checkin_color/classname convention.
        attendanceStatusClassName: `status${Number(row.attendanceStatus) + 1}`,
        petitionerCheckin: hasPartyCheckedIn(row.docketCaseId, row.caseName),
        petitionerAttorneyCheckin: hasPartyCheckedIn(row.docketCaseId, row.petitionerAttorney),
        respondentAttorneyCheckin: hasPartyCheckedIn(row.docketCaseId, row.respondentAttorney),
        caseOfficialCheckin: hasPartyCheckedIn(row.docketCaseId, row.caseOfficial),
      };
    });

  // party_lastname/party_firstname and advanceFilter (attendanceStatus/
  // docketStatus/cma/hearingSite/caseType - docketStatusDateUpdate is
  // intentionally not applied, see file header) - same matching helpers as
  // checkinInfoListService.js, applied before sort/paginate.
  const normalizedLastName = (partyLastName || "").trim().toLowerCase();
  const normalizedFirstName = (partyFirstName || "").trim().toLowerCase();
  const filteredList = list.filter(
    (row) =>
      matchesPartyName(row, normalizedLastName, normalizedFirstName) &&
      matchesFilterCategory(advanceFilter.attendanceStatus, row.attendanceStatus) &&
      matchesFilterCategory(advanceFilter.docketStatus, row.docketStatus) &&
      matchesFilterCategory(advanceFilter.cma, row.cma) &&
      matchesFilterCategory(advanceFilter.hearingSite, row.hearingSite) &&
      matchesFilterCategory(advanceFilter.caseType, row.caseType),
  );

  const orderByField = ORDERBY_FIELD_MAP[searchCondition.orderby] || "docketCaseId";
  const sortDirection = Number(searchCondition.order) ? "DESC" : "ASC";
  filteredList.sort((a, b) => {
    const cmp = compareValues(a[orderByField], b[orderByField]);
    return sortDirection === "ASC" ? cmp : -cmp;
  });

  const { limit, offset } = parsePagination(searchCondition.length, searchCondition.start, 50);
  const total = filteredList.length;
  const pageList = filteredList.slice(offset, offset + limit);

  return {
    checkinDate: hearingDate,
    hearingJudgesName,
    hearingTime,
    timeData,
    list: pageList,
    total: [{ total }],
    firstRecord: total ? offset + 1 : 0,
    lastRecord: Math.min(offset + limit, total),
  };
};
