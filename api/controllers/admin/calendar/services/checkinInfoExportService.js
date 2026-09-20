// checkinInfoExportService - CheckInInfoPage's "Export as CSV" action.
// Converted from PHP OsahCheckInCalenderController::exportcheckinDataAction /
// OsahCheckinCalendarModel::exportStartCheckinInfoCalendar.
//
// Deliberately NOT the same data as checkinInfoListService.js's grid: this
// exports every checkin_calendar_today_date row for judgeUserId today
// (hearing_date = today), across every hearing-time tab, ignoring whatever
// Last/First Name search, Check-In Filters panel, or hearing-time tab is
// currently applied on screen - mirrors legacy's own scope exactly (its
// export function takes only judge_userid, no filter params, and doesn't
// filter on start_checkin either). It also has its own, wider column set:
// several columns pull the docket table's own case_name/hearing_time/
// hearing_site/judge fields rather than checkin_calendar_today_date's frozen
// copies (chkcal.case_name/hearing_site is a *different* value from
// docket.casename/hearingsite - see "Hearing Location" vs "Location" below),
// plus two columns from docketdisposition/peopledetails that the grid
// doesn't surface at all - so this stays a separate service rather than
// layering onto checkinInfoListService.js.
import { Op } from "sequelize";
import Docket from "../../../../models/Docket.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import AttendanceStatusMaster from "../../../../models/AttendanceStatusMaster.js";
import DocketDisposition from "../../../../models/DocketDisposition.js";
import PeopleDetails from "../../../../models/PeopleDetails.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { todayDateOnly } from "./checkinSharedHelpers.js";
import { escapeCsvValue } from "../../../../utilities/csvEscape.js";

// Column order mirrors legacy's own $header array exactly.
export const CHECKIN_EXPORT_HEADERS = [
  "Docket #",
  "Case Name",
  "Agency",
  "Casetype",
  "Hearing Date",
  "Hearing Time",
  "Hearing Location",
  "# County",
  "Status",
  "Judge",
  "Agency Ref #",
  "Pet. Attorney",
  "Petitioner",
  "Case Official",
  "Disposition Outcome",
  "Disposition Date",
  "(optional) Continuance date",
  "Attendance",
  "Notes",
  "Res. Attorney",
  "Location",
  "CMA",
];

// chkcal.petitioner_attorney/respondent_attorney/case_official can be
// literally the string '(NULL)' (a placeholder some legacy write path
// leaves behind - same quirk sanitizePartyDisplayValue in
// checkinInfoListHelpers.js works around for the grid). Legacy's own
// `CASE WHEN ... != '(NULL)' THEN ... ELSE ''` collapses it to '' here too;
// Case Name (docket.casename) deliberately does NOT get this treatment -
// legacy's export SQL passes it through raw, unlike the grid's
// sanitizePartyDisplayValue.
const cleanFrozenParty = (value) => (value && value !== "(NULL)" ? value : "");

// Docket.hearingDate/DocketDisposition.dispositionDate are DATETIME columns
// (unlike checkin_calendar_today_date.hearing_date, which is DATEONLY) - raw
// Sequelize reads come back as JS Date objects, so this normalizes both to
// the same 'YYYY-MM-DD' shape the rest of the CSV uses.
const formatDateOnly = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export const exportCheckinInfoList = async ({ judgeUserId }) => {
  if (!judgeUserId) {
    throw new CalendarServiceError(400, "judge_userid is required");
  }

  const today = todayDateOnly();

  // No start_checkin/hearingTime filter here, unlike
  // listStartCheckinInfoCalendar/resolveHearingContext - mirrors legacy's
  // exportStartCheckinInfoCalendar exactly, which pulls every
  // checkin_calendar_today_date row for this judge today (including a
  // docket-status-only row whose start_checkin is still '0' - see that
  // column's own comment in CheckinCalendarTodayDate.js), not just the
  // ones the check-in queue currently has active.
  const checkinRows = await CheckinCalendarTodayDate.findAll({
    where: { judgeId: judgeUserId, hearingDate: today },
    raw: true,
  });
  if (!checkinRows.length) return null;

  const caseIds = [...new Set(checkinRows.map((row) => row.docketCaseId))];

  const [docketRows, dispositionRows, petitionerRows, statusRows] = await Promise.all([
    Docket.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: [
        "caseId", "caseName", "refAgency", "caseType", "hearingTime", "hearingSite",
        "county", "status", "judge", "agencyRefNumber", "hearingDate",
      ],
      raw: true,
    }),
    // docketdisposition's caseId is its primary key (one row per case, see
    // DocketDisposition.js) - no fanout/latest-pick needed, unlike a
    // one-to-many table.
    DocketDisposition.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "dispositionCode", "dispositionDate"],
      raw: true,
    }),
    // Most-recently-added Petitioner contact per case - legacy's own
    // `ORDER BY pd2.peopleid DESC LIMIT 0,1`, formatted "Firstname Lastname"
    // (not the "Lastname, Firstname" the rest of this app uses for display
    // names - matches legacy's CONCAT(pd2.Firstname,' ',pd2.Lastname)).
    PeopleDetails.findAll({
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: "Petitioner" },
      attributes: ["caseId", "firstName", "lastName"],
      order: [["peopleId", "DESC"]],
      raw: true,
    }),
    AttendanceStatusMaster.findAll({ attributes: ["status", "statusName"], raw: true }),
  ]);

  const docketByCaseId = new Map(docketRows.map((d) => [d.caseId, d]));
  const dispositionByCaseId = new Map(dispositionRows.map((d) => [d.caseId, d]));
  const statusNameByStatus = new Map(statusRows.map((s) => [s.status, s.statusName]));

  const petitionerByCaseId = new Map();
  petitionerRows.forEach((p) => {
    if (petitionerByCaseId.has(p.caseId)) return; // first hit per case = highest peopleId, thanks to the DESC order above
    const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    if (name) petitionerByCaseId.set(p.caseId, name);
  });

  // Mirrors legacy's `JOIN docket AS d ON d.caseid = chkcal.docket_caseid` -
  // a row with no matching docket is dropped, same as an INNER JOIN would
  // drop it. No judge/cma/attendance-status-master join requirement here,
  // unlike checkinInfoListService.js - legacy's export query doesn't have
  // those (Attendance below is resolved via a plain lookup instead).
  const rows = checkinRows
    .filter((row) => docketByCaseId.has(row.docketCaseId))
    .map((row) => {
      const docket = docketByCaseId.get(row.docketCaseId);
      const disposition = dispositionByCaseId.get(row.docketCaseId);
      // Mirrors MySQL's CONCAT(agency, ' - ', casetype), which returns NULL
      // (-> '') the moment either side is NULL, rather than silently
      // dropping the missing half.
      const agencyCaseType =
        docket.refAgency != null && docket.caseType != null
          ? `${docket.refAgency} - ${docket.caseType}`
          : "";

      return {
        docketCaseId: row.docketCaseId,
        values: [
          row.docketCaseId,
          docket.caseName ?? "",
          docket.refAgency ?? "",
          agencyCaseType,
          today,
          docket.hearingTime ?? "",
          docket.hearingSite ?? "",
          docket.county ?? "",
          docket.status ?? "",
          docket.judge ?? "",
          docket.agencyRefNumber ?? "",
          cleanFrozenParty(row.petitionerAttorney),
          petitionerByCaseId.get(row.docketCaseId) ?? "",
          cleanFrozenParty(row.caseOfficial),
          disposition?.dispositionCode ?? "",
          formatDateOnly(disposition?.dispositionDate),
          // "(optional) Continuance date" - legacy names this after the
          // docket's own current hearing date (d.hearingdate), not an
          // actual continuance-history field; kept as-is for parity even
          // though it duplicates the "Hearing Date" column whenever this
          // docket's hearing is today's (the common case here, since it's
          // scoped to today's checked-in dockets).
          formatDateOnly(docket.hearingDate),
          statusNameByStatus.get(row.attendanceStatus) ?? "",
          row.notes ?? "",
          cleanFrozenParty(row.respondentAttorney),
          // "Location" - the FROZEN checkin_calendar_today_date.hearing_site
          // captured at Start Check-in time, deliberately distinct from
          // "Hearing Location" above (docket.hearingsite, the docket's
          // current value - can drift from this if the docket's site
          // changed after check-in started).
          row.hearingSite ?? "",
          row.cma ?? "",
        ],
      };
    })
    // Mirrors legacy's `ORDER BY chkcal.docket_caseid`.
    .sort((a, b) => a.docketCaseId - b.docketCaseId);

  if (!rows.length) return null;

  const csvLines = [
    CHECKIN_EXPORT_HEADERS.join(","),
    ...rows.map((row) => row.values.map(escapeCsvValue).join(",")),
  ];
  return csvLines.join("\n");
};
