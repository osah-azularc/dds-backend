// Unit tests for pastCalendarListService.js's pure, DB-free pieces:
// validation, grouping/aggregation, and pagination - re-exported by
// pastCalendarListService.js but defined in (and imported here directly
// from) pastCalendarSearchHelpers.js, which has no Sequelize/DB import. That
// separation matters for testing: pastCalendarListService.js (like every
// other services/ file in this module) transitively imports
// connections/seqDB.js via a Docket/JudgeAssistantClerk model, which throws
// immediately on import unless initializeDatabase() has already run (see
// bootstrap.js) - so it can't be imported standalone here. The DB-touching
// parts (buildPastCalendarFilterConditions's id -> docket-value resolution,
// getListOfPastCalendars's Docket/JudgeAssistantClerk queries) aren't
// covered by this file as a result; see summary notes.
//
// Run with: node --test api/controllers/admin/calendar/services/__tests__/pastCalendarListService.test.js
// (this project has no test runner wired into `npm test` yet - see summary notes)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validatePastCalendarSearchData,
  groupPastCalendarRows,
  paginatePastCalendarGroups,
} from "../pastCalendarSearchHelpers.js";
import { CalendarServiceError } from "../calendarServiceError.js";

describe("validatePastCalendarSearchData", () => {
  test("throws a 400 CalendarServiceError when no searchData filter is present", () => {
    assert.throws(
      () => validatePastCalendarSearchData({}),
      (error) => error instanceof CalendarServiceError && error.status === 400,
    );
  });

  test("throws when searchData only has blank/whitespace values", () => {
    assert.throws(
      () => validatePastCalendarSearchData({ hearing_date: "", judge_id: "   " }),
      (error) => error instanceof CalendarServiceError && error.status === 400,
    );
  });

  test("does not throw when exactly one recognized filter is present", () => {
    assert.doesNotThrow(() => validatePastCalendarSearchData({ judge_id: "305" }));
  });

  test("does not throw when hearing_date alone is present", () => {
    assert.doesNotThrow(() => validatePastCalendarSearchData({ hearing_date: "2026-08-11" }));
  });
});

describe("groupPastCalendarRows", () => {
  test("groups by (hearingDate, judge), de-duplicating cma/courtLocations/hearingTimes", () => {
    const rows = [
      {
        hearingDate: "08-11-2026",
        judge: "Barnes Shakara",
        judgeAssistant: "Devin Hamilton",
        hearingSite: "OSAH - Atlanta",
        hearingTime: "09:00 AM",
      },
      // Same date/judge, different CMA/site/time -> aggregated into the same group.
      {
        hearingDate: "08-11-2026",
        judge: "Barnes Shakara",
        judgeAssistant: "Jane Doe",
        hearingSite: "OSAH - Atlanta",
        hearingTime: "10:30 AM",
      },
      // Exact duplicate CMA/site/time -> must not be double-counted.
      {
        hearingDate: "08-11-2026",
        judge: "Barnes Shakara",
        judgeAssistant: "Devin Hamilton",
        hearingSite: "OSAH - Atlanta",
        hearingTime: "09:00 AM",
      },
      // Different judge, same date -> separate group.
      {
        hearingDate: "08-11-2026",
        judge: "Malihi Michael",
        judgeAssistant: "Devin Hamilton",
        hearingSite: "OSAH - Macon",
        hearingTime: "01:00 PM",
      },
    ];

    const groups = groupPastCalendarRows(rows);

    assert.equal(groups.length, 2);

    const barnesGroup = groups.find((g) => g.judge === "Barnes Shakara");
    assert.ok(barnesGroup);
    assert.deepEqual([...barnesGroup.cma].sort(), ["Devin Hamilton", "Jane Doe"]);
    assert.deepEqual([...barnesGroup.courtLocations], ["OSAH - Atlanta"]);
    assert.deepEqual([...barnesGroup.hearingTimes].sort(), ["09:00 AM", "10:30 AM"]);

    const malihiGroup = groups.find((g) => g.judge === "Malihi Michael");
    assert.ok(malihiGroup);
    assert.deepEqual([...malihiGroup.cma], ["Devin Hamilton"]);
  });

  test("sorts groups by hearingDate descending", () => {
    const rows = [
      { hearingDate: "08-01-2026", judge: "A" },
      { hearingDate: "08-15-2026", judge: "B" },
      { hearingDate: "08-10-2026", judge: "C" },
    ];

    const groups = groupPastCalendarRows(rows);

    assert.deepEqual(
      groups.map((g) => g.hearingDate),
      ["08-15-2026", "08-10-2026", "08-01-2026"],
    );
  });

  test("falls back to 'Unassigned' for a blank/missing judge", () => {
    const groups = groupPastCalendarRows([{ hearingDate: "08-11-2026", judge: "" }]);
    assert.equal(groups[0].judge, "Unassigned");
  });
});

describe("paginatePastCalendarGroups", () => {
  const makeGroups = (count) =>
    Array.from({ length: count }, (_, i) => ({ hearingDate: `group-${i}`, judge: `judge-${i}` }));

  test("returns the correct slice, total, and record bounds for a middle page", () => {
    const groups = makeGroups(120);
    const result = paginatePastCalendarGroups(groups, { limit: 50, offset: 50 });

    assert.equal(result.total, 120);
    assert.equal(result.pageGroups.length, 50);
    assert.equal(result.pageGroups[0].hearingDate, "group-50");
    assert.equal(result.pageGroups[49].hearingDate, "group-99");
    assert.equal(result.firstRecord, 51);
    assert.equal(result.lastRecord, 100);
  });

  test("clamps lastRecord to total on the final, partial page", () => {
    const groups = makeGroups(120);
    const result = paginatePastCalendarGroups(groups, { limit: 50, offset: 100 });

    assert.equal(result.pageGroups.length, 20);
    assert.equal(result.firstRecord, 101);
    assert.equal(result.lastRecord, 120);
  });

  test("returns zeroed record bounds when there are no groups", () => {
    const result = paginatePastCalendarGroups([], { limit: 50, offset: 0 });

    assert.equal(result.total, 0);
    assert.deepEqual(result.pageGroups, []);
    assert.equal(result.firstRecord, 0);
    assert.equal(result.lastRecord, 0);
  });
});
