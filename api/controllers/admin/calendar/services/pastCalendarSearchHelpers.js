// Pure, DB-free pieces of the Past Calendar search (pastCalendarListService.js)
// pulled out into their own module deliberately: everything else in
// services/ transitively imports connections/seqDB.js (via a Sequelize
// model), which throws immediately on import unless initializeDatabase() has
// already run (see bootstrap.js) - that's fine for the running app, but it
// means none of that code can be imported standalone by a unit test. Keeping
// the validation/grouping/pagination logic here, with zero DB imports, lets
// __tests__/pastCalendarListService.test.js exercise it directly without a
// database or any mocking.
import { CalendarServiceError } from "./calendarServiceError.js";

// The searchData keys the Past Calendar screen's dropdowns/date field send.
// At least one must be present - this is enforced server-side (not just by
// the client) per the legacy screen's own rule.
export const SEARCHABLE_FIELDS = [
  "hearing_date",
  "court_location_id",
  "circuit_id",
  "casetype_id",
  "judge_id",
  "cma_id",
];

export const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

/** Throws a 400 CalendarServiceError unless at least one recognized filter is present. */
export const validatePastCalendarSearchData = (searchData = {}) => {
  const hasFilter = SEARCHABLE_FIELDS.some((field) => hasValue(searchData[field]));
  if (!hasFilter) {
    throw new CalendarServiceError(
      400,
      "Please provide at least one search filter (hearing date, hearing location, county circuit, casetype, judge, or CMA).",
    );
  }
};

/**
 * Groups already-filtered Docket rows by (hearingDate, judge) - mirrors the
 * legacy `GROUP BY hearing_date, judge_id` with `GROUP_CONCAT(DISTINCT ...)`
 * for cma/courtLocations/hearingTimes - then sorts groups by hearing_date
 * DESC (legacy ORDER BY).
 *
 * @param {Array<{hearingDate: string, judge: string, judgeAssistant: ?string,
 *   hearingSite: ?string, hearingTime: ?string}>} rows - `hearingDate` must
 *   already be a display-ready, sortable string (e.g. DATE_FORMAT'd at the
 *   query level) - grouping/sorting is done on that raw string.
 * @returns {Array<{hearingDate: string, judge: string, cma: Set<string>,
 *   courtLocations: Set<string>, hearingTimes: Set<string>}>}
 */
export const groupPastCalendarRows = (rows) => {
  const groups = new Map();

  rows.forEach((row) => {
    const judgeName = (row.judge || "").trim() || "Unassigned";
    const key = `${row.hearingDate}|${judgeName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        hearingDate: row.hearingDate,
        judge: judgeName,
        cma: new Set(),
        courtLocations: new Set(),
        hearingTimes: new Set(),
      });
    }
    const group = groups.get(key);
    if (row.judgeAssistant) group.cma.add(row.judgeAssistant.trim());
    if (row.hearingSite) group.courtLocations.add(row.hearingSite.trim());
    if (row.hearingTime) group.hearingTimes.add(row.hearingTime.trim());
  });

  return [...groups.values()].sort((a, b) => {
    if (a.hearingDate === b.hearingDate) return 0;
    return a.hearingDate > b.hearingDate ? -1 : 1; // DESC
  });
};

/**
 * Slices sorted groups to one page and reports total/firstRecord/lastRecord.
 * `total` here is the number of *groups*, not the number of underlying
 * docket rows.
 */
export const paginatePastCalendarGroups = (sortedGroups, { limit, offset }) => {
  const total = sortedGroups.length;
  return {
    pageGroups: sortedGroups.slice(offset, offset + limit),
    total,
    firstRecord: total ? offset + 1 : 0,
    lastRecord: Math.min(offset + limit, total),
  };
};
