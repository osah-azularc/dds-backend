// Check-In Info list for a single judge - the per-case attendance/checkin
// grid shown after "Start Check-in" (CheckInInfoPage.jsx), reached from
// CheckInTab's "Start Check-in" / "Continue Check-in" button. Converted
// from PHP OsahCheckInCalenderController::listStartCheckinInfoCalendarAction
// / OsahCheckinCalendarModel::{getStartCheckinCalendarTimeData,
// listStartCheckinInfoCalendar}.
//
// The read-only Past Calendar "View Check-in" grid (PastCalendarInfoPage.jsx)
// is a separate, dedicated port - pastCheckinInfoListService.js - reading the
// archived checkin_calendar_past_date/attendance_status_past_date tables
// rather than reusing this file's today-only query.
//
// Legacy shape, in two steps:
//   1. resolveHearingContext (checkinInfoListHelpers.js) - resolves a
//      default hearingTime (and the judge's display name) for the judge/day
//      when the caller didn't pass one, from checkin_calendar_today_date
//      rows already created by "Start Check-in" (see
//      checkinStartCheckinService.js).
//   2. listStartCheckinInfoCalendar below - the main grouped listing query,
//      joined against docket (live status), the judge/CMA lookup table
//      (also acts as an existence/active filter), attendance_status_master
//      (status label), plus per-row correlated lookups into
//      attendance_status_today_date (per-party checkin flags),
//      decision_automation_report (previous continuance date) and
//      peopledetails (case_name_contact_type).
//
// Ported here using the same batch-fetch-then-Map-join style already used
// by checkinCalendarListService.js / checkinStartCheckinService.js rather
// than literal SQL joins/correlated subqueries, to stay consistent with the
// rest of this checkin service directory. Row display formatting, the
// orderby map, advanceFilter/Last-First-Name matching and sorting all live
// in checkinInfoListHelpers.js, alongside resolveHearingContext - this file
// stays scoped to the fetch/Map-join orchestration.
//
// partyLastName/partyFirstName (CheckInInfoPage's debounced Last/First Name
// fields) and advanceFilter (its Check-In Filters panel) are applied
// server-side too, ahead of sort/pagination. advanceFilter's shape is
// CheckInInfoPage's own {attendanceStatus, docketStatus, cma, hearingSite,
// caseType, docketStatusDateUpdate} (each {value: true}), not the legacy
// payload's ID-keyed caseTypeMaster/cmaMaster/locationMaster - those would
// need their own master-list endpoints (case type/CMA/location by ID) this
// port doesn't have yet. docketStatusDateUpdate is the exception: it's a
// fixed "1"/"0" pair (Updated Today/Not Updated Today, see
// FiltersButton.jsx's DOCKET_STATUS_DATE_UPDATE_OPTIONS) matched against
// docketStatusUpdatedToday below, no master list needed.
import { Op } from "sequelize";
import Docket from "../../../../models/Docket.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import AttendanceStatusMaster from "../../../../models/AttendanceStatusMaster.js";
import AttendanceStatusTodayDate from "../../../../models/AttendanceStatusTodayDate.js";
import DecisionAutomationReport from "../../../../models/reports/DecisionAutomationReport.js";
import PeopleDetails from "../../../../models/PeopleDetails.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { todayDateOnly, formatStaffConcat } from "./checkinSharedHelpers.js";
import { parsePagination } from "../../../../helpers/reviewForm1/paginationHelper.js";
import {
  judgeDisplayName,
  ORDERBY_FIELD_MAP,
  matchesFilterCategory,
  sanitizePartyDisplayValue,
  matchesPartyName,
  compareValues,
  resolveHearingContext,
} from "./checkinInfoListHelpers.js";

export const listStartCheckinInfoCalendar = async ({
  judgeUserId,
  hearingTime: requestedHearingTime,
  partyLastName,
  partyFirstName,
  advanceFilter = {},
  searchCondition = {},
} = {}) => {
  if (!judgeUserId) {
    throw new CalendarServiceError(400, "judge_userid is required");
  }

  const today = todayDateOnly();

  const { hearingJudgesName, hearingTime, timeData } =
    await resolveHearingContext({
      judgeUserId,
      today,
      requestedHearingTime,
    });

  const checkinRows = await CheckinCalendarTodayDate.findAll({
    where: {
      judgeId: judgeUserId,
      hearingDate: today,
      startCheckin: "1",
      hearingTime,
    },
    raw: true,
  });

  if (!checkinRows.length) {
    return {
      checkinDate: today,
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

  const [
    docketRows,
    activeJudges,
    activeCmas,
    statusRows,
    attendanceTodayRows,
    continuanceRows,
    peopleRows,
  ] = await Promise.all([
    Docket.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "docketNumber", "status"],
      raw: true,
    }),
    JudgeAssistantClerk.findAll({
      where: { userType: "judge", isActive: "1" },
      attributes: ["userId", "firstName", "lastName", "title"],
      raw: true,
    }),
    JudgeAssistantClerk.findAll({
      where: { userType: "cma", isActive: "1" },
      attributes: ["userId", "firstName", "lastName"],
      raw: true,
    }),
    AttendanceStatusMaster.findAll({
      attributes: ["status", "statusName"],
      raw: true,
    }),
    AttendanceStatusTodayDate.findAll({
      where: {
        docketCaseId: { [Op.in]: caseIds },
        hearingDate: today,
        hearingTime,
        attendanceStatus: "1",
      },
      attributes: ["docketCaseId", "partyName"],
      raw: true,
    }),
    DecisionAutomationReport.findAll({
      where: { caseId: { [Op.in]: caseIds }, automationFlag: "continuance" },
      attributes: ["caseId", "pastHearingDate"],
      raw: true,
    }),
    PeopleDetails.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "lastName", "firstName", "typeOfContact"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
  ]);

  const docketByCaseId = new Map(docketRows.map((d) => [d.caseId, d]));
  // Lowercased on both sides - MySQL's own judge_assistant_clerk_concat join
  // (legacy) is a case-insensitive string comparison under the default
  // collation, but chkcal.judge_name/cma can drift in case from the active
  // judge/cma record's own current name casing (e.g. a row frozen as
  // "cma amol" while the active record now formats as "Cma Amol") - a plain
  // case-sensitive JS Set/Map lookup would then wrongly drop the row that
  // legacy's INNER JOIN still matches. Mirrors the same .toLowerCase()
  // already used for this in checkinCalendarListService.js's judgeIdByConcat.
  const normalizeConcat = (value) => (value || "").trim().toLowerCase();
  const judgeByConcat = new Map(
    activeJudges.map((j) => [normalizeConcat(formatStaffConcat(j)), j]),
  );
  const cmaConcats = new Set(
    activeCmas.map((c) => normalizeConcat(formatStaffConcat(c))),
  );
  const statusNameByStatus = new Map(
    statusRows.map((s) => [s.status, s.statusName]),
  );

  // attendance_status_today_date.partyname stores the actual party's name
  // (e.g. "SMITH, JOHN"), not a fixed role label - checkinPartiesService.js
  // writes it as whatever value the clicked cell held. So each of the 4
  // *_checkin flags below is keyed by this row's own party name value, not
  // a shared label.
  const checkedInPartySet = new Set(
    attendanceTodayRows.map((r) => `${r.docketCaseId}|${r.partyName}`),
  );
  const hasPartyCheckedIn = (caseId, partyNameValue) =>
    partyNameValue && checkedInPartySet.has(`${caseId}|${partyNameValue}`)
      ? "1"
      : "0";

  const maxContinuanceByCaseId = new Map();
  continuanceRows.forEach((r) => {
    if (!r.pastHearingDate) return;
    const current = maxContinuanceByCaseId.get(r.caseId);
    if (!current || r.pastHearingDate > current)
      maxContinuanceByCaseId.set(r.caseId, r.pastHearingDate);
  });

  // Most-recent-first per case, since peopleRows was fetched sorted DESC by
  // createdDate - mirrors the legacy subquery's ORDER BY created_date DESC LIMIT 1.
  const peopleByCaseId = new Map();
  peopleRows.forEach((p) => {
    if (!peopleByCaseId.has(p.caseId)) peopleByCaseId.set(p.caseId, []);
    peopleByCaseId.get(p.caseId).push(p);
  });
  const resolveCaseNameContactType = (caseId, caseName) => {
    const candidates = peopleByCaseId.get(caseId) || [];
    const match = candidates.find(
      (p) => `${p.lastName}, ${p.firstName}` === caseName,
    );
    return match?.typeOfContact ?? null;
  };

  // Mirrors the legacy INNER JOINs to docket (must still exist) and to
  // judge_assistant_clerk for both cma and judge_name (must resolve to an
  // active staff record) - rows failing any of these are dropped, same as
  // an INNER JOIN would drop them.
  const droppedRows = checkinRows.filter((row) => {
    const judgeConcat = normalizeConcat(row.judgeName);
    const cmaConcat = normalizeConcat(row.cma);
    return !(
      docketByCaseId.has(row.docketCaseId) &&
      judgeByConcat.has(judgeConcat) &&
      cmaConcats.has(cmaConcat)
    );
  });

  const list = checkinRows
    .filter((row) => {
      const judgeConcat = normalizeConcat(row.judgeName);
      const cmaConcat = normalizeConcat(row.cma);
      return (
        docketByCaseId.has(row.docketCaseId) &&
        judgeByConcat.has(judgeConcat) &&
        cmaConcats.has(cmaConcat)
      );
    })
    .map((row) => {
      const docket = docketByCaseId.get(row.docketCaseId);
      const judge = judgeByConcat.get(normalizeConcat(row.judgeName));

      return {
        id: row.id,
        docketCaseId: row.docketCaseId,
        caseName: sanitizePartyDisplayValue(row.caseName),
        docketNumber: docket.docketNumber,
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
        // Live docket status (docket.status), not the possibly-stale copy
        // frozen on checkin_calendar_today_date at "Start Check-in" time.
        docketStatus: docket.status,
        docketStatusUpdatedToday: row.docketStatusUpdatedToday,
        attendanceStatus: row.attendanceStatus,
        statusName: statusNameByStatus.get(row.attendanceStatus) ?? null,
        // "status0" -> "status1" etc - matches the legacy
        // status_wise_checkin_color/classname pattern seen on the DataGrid
        // status chip (attendance_status "0" => "status1").
        attendanceStatusClassName: `status${Number(row.attendanceStatus) + 1}`,
        // "petitioner" here covers the Case Name cell, which displays
        // whichever of Representative/Petitioner the case actually has
        // (see caseNameContactType below) - same value checkinPartiesService.js
        // writes to attendance_status_today_date when that cell is clicked.
        petitionerCheckin: hasPartyCheckedIn(row.docketCaseId, row.caseName),
        petitionerAttorneyCheckin: hasPartyCheckedIn(
          row.docketCaseId,
          row.petitionerAttorney,
        ),
        respondentAttorneyCheckin: hasPartyCheckedIn(
          row.docketCaseId,
          row.respondentAttorney,
        ),
        caseOfficialCheckin: hasPartyCheckedIn(
          row.docketCaseId,
          row.caseOfficial,
        ),
        previousContinuanceHearingDate:
          maxContinuanceByCaseId.get(row.docketCaseId) ?? null,
        caseNameContactType: resolveCaseNameContactType(
          row.docketCaseId,
          row.caseName,
        ),
      };
    });

  // party_lastname/party_firstname (Last/First Name search fields) and
  // advanceFilter (attendanceStatus/docketStatus/cma/hearingSite/caseType/
  // docketStatusDateUpdate - the Check-In Filters panel, see
  // FiltersButton.jsx) applied before sort/paginate so pagination totals
  // reflect the filtered set, not the full day's dockets. Last/First Name
  // OR-matches across all four party columns (case name, petitioner
  // attorney, respondent attorney, case official) - mirrors the legacy
  // $where's SUBSTRING_INDEX-based OR block, not just case_name (see
  // matchesPartyName, checkinInfoListHelpers.js).
  const normalizedLastName = (partyLastName || "").trim().toLowerCase();
  const normalizedFirstName = (partyFirstName || "").trim().toLowerCase();
  const filteredList = list.filter(
    (row) =>
      matchesPartyName(row, normalizedLastName, normalizedFirstName) &&
      matchesFilterCategory(
        advanceFilter.attendanceStatus,
        row.attendanceStatus,
      ) &&
      matchesFilterCategory(advanceFilter.docketStatus, row.docketStatus) &&
      matchesFilterCategory(advanceFilter.cma, row.cma) &&
      matchesFilterCategory(advanceFilter.hearingSite, row.hearingSite) &&
      matchesFilterCategory(advanceFilter.caseType, row.caseType) &&
      matchesFilterCategory(
        advanceFilter.docketStatusDateUpdate,
        row.docketStatusUpdatedToday,
      ),
  );

  // orderby/order come from the grid (searchCondition) - ORDERBY_FIELD_MAP
  // keeps adding a new sortable column a one-line change. Truthy `order` ->
  // DESC, falsy (including the default 0) -> ASC.
  const orderByField =
    ORDERBY_FIELD_MAP[searchCondition.orderby] || "docketCaseId";
  const sortDirection = Number(searchCondition.order) ? "DESC" : "ASC";
  filteredList.sort((a, b) => {
    const cmp = compareValues(a[orderByField], b[orderByField]);
    return sortDirection === "ASC" ? cmp : -cmp;
  });

  // Paginated the same way getListOfTodaysCalendars is (checkinCalendarListService.js) -
  // the full list is built/sorted in JS first (its rows come from several
  // batch-fetched/JS-joined sources, not one Sequelize query), then sliced,
  // rather than pushing LIMIT/OFFSET down to a single findAndCountAll like
  // hearingInfoService.js's getHearingInfo does.
  const { limit, offset } = parsePagination(
    searchCondition.length,
    searchCondition.start,
    50,
  );
  const total = filteredList.length;
  const pageList = filteredList.slice(offset, offset + limit);

  return {
    checkinDate: today,
    hearingJudgesName,
    hearingTime,
    timeData,
    list: pageList,
    total: [{ total }],
    firstRecord: total ? offset + 1 : 0,
    lastRecord: Math.min(offset + limit, total),
  };
};
