// Supporting logic for checkinInfoListService.js's listStartCheckinInfoCalendar,
// split out to keep that file focused on the fetch/Map-join orchestration:
// display formatting, the sort/orderby map, advanceFilter matching, party
// display-value sanitizing, and the Last/First Name search matcher. Kept
// alongside checkinInfoListService.js (not checkinSharedHelpers.js) since
// none of this is shared with checkinCalendarListService.js /
// checkinStartCheckinService.js - it's specific to this one list's row shape.
import { CalendarServiceError } from "./calendarServiceError.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";

// judge_new_name in the legacy response ("Judge Amol Test" from
// title="Judge", firstName="Amol", lastName="Test") - the judge's display
// name shown on the list header and each row.
export const judgeDisplayName = (record) =>
  [record?.title, record?.firstName, record?.lastName].filter(Boolean).join(" ");

// "23:45:00" -> "11:45 PM", matching the legacy timeData map's display value.
export const formatTime12h = (time) => {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time || "";
  let hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
};

// Every column checkInInfoColumns.jsx renders is sortable, so both the
// snake_case legacy-payload keys and the grid's own camelCase field names
// map here (the grid can - and does - send its field name directly as
// orderby). Unrecognized values fall back to docketCaseId.
export const ORDERBY_FIELD_MAP = {
  docket_caseid: "docketCaseId",
  docketCaseId: "docketCaseId",
  case_name: "caseName",
  caseName: "caseName",
  docket_number: "docketNumber",
  docketNumber: "docketNumber",
  case_type: "caseType",
  caseType: "caseType",
  cma: "cma",
  petitioner_attorney: "petitionerAttorney",
  petitionerAttorney: "petitionerAttorney",
  respondent_attorney: "respondentAttorney",
  respondentAttorney: "respondentAttorney",
  case_official: "caseOfficial",
  caseOfficial: "caseOfficial",
  attendance_status: "attendanceStatus",
  attendanceStatus: "attendanceStatus",
  docket_status: "docketStatus",
  docketStatus: "docketStatus",
  agency_reference_number: "agencyReferenceNumber",
  agencyReferenceNumber: "agencyReferenceNumber",
  hearing_site: "hearingSite",
  hearingSite: "hearingSite",
  hearing_time: "hearingTime",
  hearingTime: "hearingTime",
};

// advanceFilter category matching (attendanceStatus/docketStatus/cma/
// hearingSite/caseType, each {value: true} - mirrors FiltersButton.jsx's
// EMPTY_ADVANCE_FILTER shape): a category with nothing checked doesn't
// filter that dimension at all.
export const matchesFilterCategory = (selected = {}, value) => {
  const checkedValues = Object.keys(selected).filter((key) => selected[key]);
  return checkedValues.length === 0 || checkedValues.includes(String(value ?? ""));
};

// Mirrors the legacy SELECT's CASE expressions on case_name/
// petitioner_attorney/respondent_attorney/case_official: chkcal.<field> is
// returned as-is UNLESS it's '', SQL NULL, or the literal placeholder
// string '(NULL)' (a junk value some legacy write path apparently left
// behind) - any of those collapse to ''. Also collapses the "Lastname,
// Firstname" write path's degenerate case: when both halves are blank it
// still writes a bare "," (or ", " with whitespace) instead of '' - without
// this it renders as a lone comma in the grid AND, worse, reads as a
// non-empty party name so the Check-in button shows for a party that isn't
// really there.
const BLANK_PARTY_VALUES = new Set(["", "(NULL)"]);
const BLANK_PARTY_PATTERN = /^,\s*$/;
export const sanitizePartyDisplayValue = (value) => {
  if (value === null || value === undefined) return "";
  const trimmed = typeof value === "string" ? value.trim() : value;
  return BLANK_PARTY_VALUES.has(trimmed) || BLANK_PARTY_PATTERN.test(trimmed) ? "" : value;
};

// SUBSTRING_INDEX(value, ', ', 1) / SUBSTRING_INDEX(value, ', ', -1) - the
// legacy $where's last/first name split, assuming "Lastname, Firstname"
// formatting: everything before the first ", " is the last-name part,
// everything after the last ", " is the first-name part. Falls back to the
// whole string when no ", " is present, matching MySQL's own
// SUBSTRING_INDEX behavior when the delimiter count exceeds the string's
// occurrences.
const lastNamePart = (value) => {
  const str = value || "";
  const idx = str.indexOf(", ");
  return idx === -1 ? str : str.slice(0, idx);
};
const firstNamePart = (value) => {
  const str = value || "";
  const idx = str.lastIndexOf(", ");
  return idx === -1 ? str : str.slice(idx + 2);
};

// party_lastname/party_firstname (Last/First Name search fields) OR-match
// against case_name, petitioner_attorney, respondent_attorney AND
// case_official - not just case_name - mirrors the legacy $where's
// SUBSTRING_INDEX-based OR block across all four party columns.
const SEARCHABLE_PARTY_FIELDS = ["caseName", "petitionerAttorney", "respondentAttorney", "caseOfficial"];
const matchesPartyNamePart = (row, normalizedTerm, partFn) =>
  !normalizedTerm ||
  SEARCHABLE_PARTY_FIELDS.some((field) => partFn(row[field]).toLowerCase().includes(normalizedTerm));

// party_lastname/party_firstname, applied together against a row - both
// mirror the legacy $where's SUBSTRING_INDEX-based OR block, one per part.
export const matchesPartyName = (row, normalizedLastName, normalizedFirstName) =>
  matchesPartyNamePart(row, normalizedLastName, lastNamePart) &&
  matchesPartyNamePart(row, normalizedFirstName, firstNamePart);

// Case-insensitive for strings, nullish-safe (nulls/undefined always sort
// last regardless of direction) - a plain `aVal > bVal` comparison handles
// numbers/dates fine but is inconsistent once any row's sort field is
// null/undefined, which several of these (respondentAttorney, notes,
// previousContinuanceHearingDate, ...) commonly are.
export const compareValues = (aVal, bVal) => {
  const aEmpty = aVal === null || aVal === undefined || aVal === "";
  const bEmpty = bVal === null || bVal === undefined || bVal === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aCmp = typeof aVal === "string" ? aVal.toLowerCase() : aVal;
  const bCmp = typeof bVal === "string" ? bVal.toLowerCase() : bVal;
  if (aCmp === bCmp) return 0;
  return aCmp > bCmp ? 1 : -1;
};

/**
 * Resolves the judge's display name and the hearing time to list, mirroring
 * getStartCheckinCalendarTimeData - a caller-supplied hearingTime is used
 * as-is, otherwise the earliest distinct hearing_time already checked in
 * for this judge/day is used as the default. timeData carries every
 * distinct hearing_time found, so the frontend can offer the others as a
 * switcher.
 */
export const resolveHearingContext = async ({ judgeUserId, today, requestedHearingTime }) => {
  const judge = await JudgeAssistantClerk.findOne({
    where: { userId: judgeUserId, userType: "judge", isActive: "1" },
  });
  if (!judge) {
    throw new CalendarServiceError(404, "Judge not found");
  }

  // Distinct hearing_time values are deduped in JS below rather than via a
  // DB-level GROUP BY - the number of rows checked in for one judge/day is
  // small enough that this avoids a raw-column vs. mapped-attribute mismatch
  // in the group clause.
  const checkedInRows = await CheckinCalendarTodayDate.findAll({
    where: { judgeId: judgeUserId, hearingDate: today, startCheckin: "1" },
    attributes: ["hearingTime"],
    raw: true,
  });
  if (!checkedInRows.length) {
    throw new CalendarServiceError(
      404,
      "No check-in records found for this judge today. Start check-in first.",
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
