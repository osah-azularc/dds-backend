import { Op, Sequelize } from "sequelize";
import CheckinCalendarPastDate from "../../../../models/CheckinCalendarPastDate.js";
import { parsePagination } from "../../../../helpers/reviewForm1/paginationHelper.js";
import { todayDateOnly } from "./checkinSharedHelpers.js";
import { NO_MATCH, resolveLocationFilter, resolveStaffFilter } from "./calendarDocketFilterResolvers.js";
import {
  hasValue,
  validatePastCalendarSearchData,
  groupPastCalendarRows,
  paginatePastCalendarGroups,
} from "./pastCalendarSearchHelpers.js";

export {
  validatePastCalendarSearchData,
  groupPastCalendarRows,
  paginatePastCalendarGroups,
};

/**
 * Resolves searchData into a CheckinCalendarPastDate where-clause (array of
 * Sequelize condition objects) plus an `empty` flag for when a dropdown id
 * resolved to zero underlying rows - in which case the caller should skip
 * the query entirely rather than run it with that filter simply omitted
 * (which would incorrectly match everything).
 *
 * Reads `checkin_calendar_past_date` - the same table (and same
 * `active_past_calendar = '1'` flag) legacy PHP's OsahPastCalendarModel::
 * getListOfPastCalendars() reads, so this list matches legacy's data
 * exactly, including its full pre-migration history. (PastCalendarSnapshot/
 * `past_calendar_snapshot` is a newer, parallel table the Job 1/Job 2 crons
 * only started writing 2026-08-27 onward - querying it instead returns just
 * the last few weeks, missing everything legacy already had.)
 *
 * Unlike checkinCalendarListService.js (which has to filter the live
 * `docket` table and so needs calendarDocketFilterResolvers.js's id ->
 * free-text resolution for every field), this archived table stores
 * judge_id/casetype_id/circuit_id as the same ids these dropdowns already
 * send, so those three filter directly with no resolver hop - matching
 * legacy's own `judge.user_id = filter['judge_id']` /
 * `pastchkcal.casetype_id = ...` / `pastchkcal.circuit_id = ...` clauses.
 * court_location_id and cma_id still need resolving because the row only
 * stores hearing_site/cma as free text, not ids.
 */
const buildPastCalendarFilterConditions = async (searchData = {}) => {
  const conditions = [];

  if (hasValue(searchData.hearing_date)) {
    conditions.push({ hearingDate: searchData.hearing_date });
  }

  if (hasValue(searchData.casetype_id)) {
    conditions.push({ caseTypeId: searchData.casetype_id });
  }

  if (hasValue(searchData.circuit_id)) {
    conditions.push({ circuitId: searchData.circuit_id });
  }

  if (hasValue(searchData.court_location_id)) {
    const locationName = await resolveLocationFilter(
      searchData.court_location_id,
    );
    if (locationName === NO_MATCH) return { empty: true };
    conditions.push({ hearingSite: { [Op.like]: `%${locationName}%` } });
  }

  if (hasValue(searchData.judge_id)) {
    conditions.push({ judgeId: searchData.judge_id });
  }

  if (hasValue(searchData.cma_id)) {
    const cmaConcat = await resolveStaffFilter(searchData.cma_id);
    if (cmaConcat === NO_MATCH) return { empty: true };
    conditions.push({ cma: cmaConcat });
  }

  return { empty: false, conditions };
};

// (hearing_date, judge) group-key expressions shared by both queries below -
// factored out so the GROUP BY / ORDER BY / re-filter all agree on exactly
// the same SQL text. ISO (%Y-%m-%d) rather than the display MM-DD-YYYY
// format so both the grouping key and the DESC sort are plain lexicographic
// string comparisons that actually track chronological order (MM-DD-YYYY
// sorts December before January across a year boundary).
const hearingDateKeyExpr = () =>
  Sequelize.fn("DATE_FORMAT", Sequelize.col("hearing_date"), "%Y-%m-%d");
// Same "blank/missing judge -> Unassigned" default groupPastCalendarRows
// applies in JS, done here so a NULL and a "" judge on the same date collapse
// into one SQL group instead of two.
const judgeKeyExpr = () =>
  Sequelize.fn(
    "COALESCE",
    Sequelize.fn(
      "NULLIF",
      Sequelize.fn("TRIM", Sequelize.col("judge_name")),
      "",
    ),
    "Unassigned",
  );

const formatDisplayDate = (isoDate) => {
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
};

export const getListOfPastCalendars = async ({
  searchData = {},
  searchCondition = {},
} = {}) => {
  validatePastCalendarSearchData(searchData);

  const { limit, offset } = parsePagination(
    searchCondition.length,
    searchCondition.start,
    50,
  );

  const { empty, conditions } =
    await buildPastCalendarFilterConditions(searchData);
  if (empty) {
    return { list: [], total: 0, firstRecord: 0, lastRecord: 0 };
  }

  const pastCalendarWhere = {
    [Op.and]: [
      // Strictly before today - the complement of getUpcomingCalendarData's
      // `hearingDate >= today` floor.
      Sequelize.where(Sequelize.col("hearing_date"), {
        [Op.lt]: todayDateOnly(),
      }),
      // Mirrors legacy's own `pastchkcal.active_past_calendar = '1'` - only
      // rows the (legacy or new) Check-In flow actually finalized into
      // history, not merely any past-dated case.
      { activePastCalendar: "1" },
      ...conditions,
    ],
  };

  // Phase 1: resolve just the (hearing_date, judge) groups matching the
  // filter, GROUP BY-ed and ORDER BY-ed in SQL, then paginate that (small)
  // group-key list in JS. This is the piece that used to be a single
  // `findAll` with no LIMIT, pulling every matching *case* row (not just
  // every group) into Node for every search regardless of page size.
  const groupKeyRows = await CheckinCalendarPastDate.findAll({
    where: pastCalendarWhere,
    attributes: [
      [hearingDateKeyExpr(), "hearingDateKey"],
      [judgeKeyExpr(), "judge"],
    ],
    group: [hearingDateKeyExpr(), judgeKeyExpr()],
    order: [
      [hearingDateKeyExpr(), "DESC"],
      [judgeKeyExpr(), "ASC"],
    ],
    raw: true,
  });

  if (!groupKeyRows.length) {
    return { list: [], total: 0, firstRecord: 0, lastRecord: 0 };
  }

  const {
    pageGroups: pageKeys,
    total,
    firstRecord,
    lastRecord,
  } = paginatePastCalendarGroups(groupKeyRows, { limit, offset });

  if (!pageKeys.length) {
    return { list: [], total, firstRecord, lastRecord };
  }

  // Phase 2: fetch the underlying case rows for *only* this page's groups
  // (at most `limit` date/judge pairs) to build each group's distinct
  // cma/courtLocation/hearingTime detail - bounded by page size instead of
  // by total matched history.
  const pageRows = await CheckinCalendarPastDate.findAll({
    where: {
      [Op.and]: [
        pastCalendarWhere,
        {
          [Op.or]: pageKeys.map((key) => ({
            [Op.and]: [
              Sequelize.where(hearingDateKeyExpr(), key.hearingDateKey),
              Sequelize.where(judgeKeyExpr(), key.judge),
            ],
          })),
        },
      ],
    },
    attributes: [
      [hearingDateKeyExpr(), "hearingDateKey"],
      [judgeKeyExpr(), "judge"],
      "judgeId",
      "cma",
      "hearingSite",
      "hearingTime",
    ],
    raw: true,
  });

  const detailByKey = new Map();
  pageRows.forEach((row) => {
    const key = `${row.hearingDateKey}|${row.judge}`;
    if (!detailByKey.has(key)) {
      detailByKey.set(key, {
        judgeIds: new Set(),
        cma: new Set(),
        courtLocations: new Set(),
        hearingTimes: new Set(),
      });
    }
    const detail = detailByKey.get(key);
    if (row.judgeId) detail.judgeIds.add(row.judgeId);
    if (row.cma) detail.cma.add(row.cma.trim());
    if (row.hearingSite) detail.courtLocations.add(row.hearingSite.trim());
    if (row.hearingTime) detail.hearingTimes.add(row.hearingTime.trim());
  });

  const list = pageKeys.map((key) => {
    const detail = detailByKey.get(`${key.hearingDateKey}|${key.judge}`) ?? {
      judgeIds: new Set(),
      cma: new Set(),
      courtLocations: new Set(),
      hearingTimes: new Set(),
    };
    return {
      hearing_date: formatDisplayDate(key.hearingDateKey),
      judge_userid: [...detail.judgeIds][0] ?? 0,
      judge: key.judge,
      cma: [...detail.cma].join(","),
      courtLocations: [...detail.courtLocations].join(","),
      hearingTimes: [...detail.hearingTimes].join(","),
    };
  });

  return { list, total, firstRecord, lastRecord };
};
