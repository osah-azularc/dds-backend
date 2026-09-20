// Today's Check-In calendar list - filtered/paginated/grouped-by-judge list
// of docket cases that either have a hearing scheduled today or already
// started check-in today. Converted from PHP
// OsahCheckInCalenderController::getListOfTodaysCalendarsAction /
// OsahCheckinCalendarModel::getListOfTodaysCalendars.
//
// The legacy query joined the raw `docket` table against `casetypes` and
// `judge_assistant_clerk` using free-text matches (county name, "LastName
// FirstName" concat, etc.) because `docket` predates the ID-based lookup
// tables this app now uses for its dropdowns (v2_5_circuit, casetypes,
// judge_assistant_clerk). The filters below accept the real IDs the
// CheckInTab dropdowns already resolve (see calendarCommonDataService.js /
// locationController.getAllLocations) and translate each one down to the
// text value(s) `docket` actually stores, via calendarDocketFilterResolvers.js's
// shared lookup/mapping (also used by pastCalendarListService.js):
//   - casetype_id (an individual Casetypes.caseTypeId, matching
//     CalendarManagementTab's own "Casetype" dropdown) -> {caseCode,
//     agencyCode} pair
//   - circuit_id (a v2_5_circuit id)   -> v2_5_county_circuit_map -> county
//     -> county description(s)
//   - court_location_id               -> courtlocations -> location name
//   - judge_id / cma_id (a
//     judge_assistant_clerk user id)   -> "LastName FirstName" concat
//     (matches JudgeAssistantClerk's judgeAssistantClerkConcat virtual field)
import { Op, Sequelize } from "sequelize";
import Docket from "../../../../models/Docket.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { parsePagination } from "../../../../helpers/reviewForm1/paginationHelper.js";
import {
  todayDateOnly,
  buildNotClosedCondition,
  formatStaffConcat,
} from "./checkinSharedHelpers.js";
import {
  NO_MATCH,
  resolveCasetypeFilter,
  resolveCircuitFilter,
  resolveLocationFilter,
  resolveStaffFilter,
} from "./calendarDocketFilterResolvers.js";

/**
 * Resolves searchData into a Docket where-clause, an array of qualifying
 * ids that got applied so callers can tell "no filter" from "filter matched
 * nothing", and an empty flag for when a filter resolved to NO_MATCH (in
 * which case the caller should skip the Docket query entirely).
 */
const buildDocketFilterConditions = async (searchData = {}) => {
  const conditions = [];

  if (searchData.casetype_id) {
    const pairs = await resolveCasetypeFilter(searchData.casetype_id);
    if (pairs === NO_MATCH) return { empty: true };
    conditions.push({
      [Op.or]: pairs.map(({ caseType, refAgency }) => ({
        caseType,
        refAgency,
      })),
    });
  }

  if (searchData.circuit_id) {
    const countyNames = await resolveCircuitFilter(searchData.circuit_id);
    if (countyNames === NO_MATCH) return { empty: true };
    conditions.push({ county: { [Op.in]: countyNames } });
  }

  if (searchData.court_location_id) {
    const locationName = await resolveLocationFilter(
      searchData.court_location_id,
    );
    if (locationName === NO_MATCH) return { empty: true };
    conditions.push({ hearingSite: { [Op.like]: `%${locationName}%` } });
  }

  if (searchData.judge_id) {
    const judgeConcat = await resolveStaffFilter(searchData.judge_id);
    if (judgeConcat === NO_MATCH) return { empty: true };
    conditions.push({ judge: judgeConcat });
  }

  if (searchData.cma_id) {
    const cmaConcat = await resolveStaffFilter(searchData.cma_id);
    if (cmaConcat === NO_MATCH) return { empty: true };
    conditions.push({ judgeAssistant: cmaConcat });
  }

  return { empty: false, conditions };
};

export const getListOfTodaysCalendars = async ({
  searchData = {},
  searchCondition = {},
} = {}) => {
  const today = todayDateOnly();

  const { limit, offset } = parsePagination(
    searchCondition.length,
    searchCondition.start,
    50,
  );

  const { empty, conditions } = await buildDocketFilterConditions(searchData);
  if (empty) {
    return { list: [], total: [{ total: 0 }], firstRecord: 0, lastRecord: 0 };
  }

  // Cases already in the check-in queue today (checkin_calendar_today_date
  // rows created when "Start Check-in" was clicked) - supplies the
  // start_checkin flag/frozen hearing time below, and also widens the base
  // date filter to include cases whose original hearing date has since
  // moved but whose check-in record is still open for today.
  const checkinRowsToday = await CheckinCalendarTodayDate.findAll({
    where: { hearingDate: today },
    attributes: ["docketCaseId", "startCheckin", "hearingTime"],
    raw: true,
  });
  const checkinByCaseId = new Map(
    checkinRowsToday.map((row) => [row.docketCaseId, row]),
  );

  // Mirrors legacy's own WHERE exactly:
  //   (chkcal.start_checkin IS NOT NULL OR d.hearingdate = '$currentDate')
  //   AND (d.status <> 'Closed' OR (d.status = 'Closed' AND d.closed_date
  //     IS NOT NULL AND d.closed_date = d.hearingdate))
  // buildNotClosedCondition() is ANDed across the whole OR, not scoped to
  // just the "hearing date is today" branch - a case that already started
  // check-in today still has to pass it too.
  //
  // hearingDate is compared via Sequelize.where(fn('DATE', col(...)), today)
  // rather than a plain `{ hearingDate: today }` - Docket.hearingDate is
  // typed DataTypes.DATE (not DATEONLY), so a plain attribute-keyed
  // comparison runs the RHS through Sequelize's own DATE-type coercion,
  // which silently shifts a bare 'YYYY-MM-DD' string by several hours
  // (confirmed via query logging: 'today' round-tripped to
  // 'today 04:00:00' on this host) before it ever reaches MySQL - since
  // docket.hearingdate is always stored at literal midnight, that shifted
  // value then matches nothing, and this whole OR-branch silently never
  // matched a single row. Wrapping the column in DATE(...) instead compares
  // a raw SQL expression to the literal date string with no attribute-type
  // coercion involved, exactly like buildNotClosedCondition's own
  // column-vs-column comparison above.
  const docketWhere = {
    [Op.and]: [
      {
        [Op.or]: [
          { caseId: { [Op.in]: [...checkinByCaseId.keys()] } },
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("hearingdate")),
            today,
          ),
        ],
      },
      buildNotClosedCondition(),
      ...conditions,
    ],
  };

  const docketRows = await Docket.findAll({
    where: docketWhere,
    attributes: [
      "caseId",
      "judge",
      "judgeAssistant",
      "hearingSite",
      "hearingTime",
      "docketCreatedDate",
    ],
    raw: true,
  });

  if (!docketRows.length) {
    return { list: [], total: [{ total: 0 }], firstRecord: 0, lastRecord: 0 };
  }

  // Active judges, batched once and matched in JS against each group's
  // judge name - judgeAssistantClerkConcat is a VIRTUAL column so it can't
  // be queried directly, and the number of distinct judges on a single
  // day's calendar is small enough that this avoids one lookup query per
  // judge.
  const activeJudges = await JudgeAssistantClerk.findAll({
    where: { userType: "judge", isActive: "1" },
    attributes: ["userId", "firstName", "lastName"],
    raw: true,
  });
  const judgeIdByConcat = new Map(
    activeJudges.map((j) => [formatStaffConcat(j).toLowerCase(), j.userId]),
  );

  // Group by judge - mirrors the legacy GROUP BY d.judge with
  // GROUP_CONCAT(DISTINCT ...) for cma/courtLocations/hearingTimes.
  const groupsByJudge = new Map();
  docketRows.forEach((row) => {
    const judgeName = (row.judge || "").trim();
    const key = judgeName || "Unassigned";
    if (!groupsByJudge.has(key)) {
      groupsByJudge.set(key, {
        judge: judgeName || "Unassigned",
        cma: new Set(),
        courtLocations: new Set(),
        hearingTimes: new Set(),
        startCheckin: false,
        latestCreatedDate: row.docketCreatedDate,
      });
    }
    const group = groupsByJudge.get(key);

    if (row.judgeAssistant) group.cma.add(row.judgeAssistant.trim());
    if (row.hearingSite) group.courtLocations.add(row.hearingSite.trim());

    const checkin = checkinByCaseId.get(row.caseId);
    const effectiveHearingTime = checkin?.hearingTime || row.hearingTime;
    if (effectiveHearingTime) group.hearingTimes.add(effectiveHearingTime);
    if (checkin?.startCheckin === "1") group.startCheckin = true;

    if (row.docketCreatedDate > group.latestCreatedDate) {
      group.latestCreatedDate = row.docketCreatedDate;
    }
  });

  // Legacy accepts searchCondition.orderby/order (the old screen always
  // sends orderby: "created_date", order: 1) but never actually applies
  // them - the query is hardcoded to ORDER BY start_checkin DESC, so judges
  // who already started check-in float to the top. latestCreatedDate is
  // kept only as a tiebreaker (newest first) since the legacy DB's ordering
  // among ties was otherwise unspecified.
  const sortedGroups = [...groupsByJudge.values()].sort((a, b) => {
    if (a.startCheckin !== b.startCheckin) return a.startCheckin ? -1 : 1;
    if (a.latestCreatedDate === b.latestCreatedDate) return 0;
    return a.latestCreatedDate > b.latestCreatedDate ? -1 : 1;
  });

  const total = sortedGroups.length;
  const pageGroups = sortedGroups.slice(offset, offset + limit);

  const list = pageGroups.map((group) => ({
    judge_userid: judgeIdByConcat.get(group.judge.toLowerCase()) ?? 0,
    judge: group.judge,
    cma: [...group.cma].join(","),
    courtLocations: [...group.courtLocations].join(","),
    hearingTimes: [...group.hearingTimes].join(","),
    start_checkin: group.startCheckin ? "1" : "0",
  }));

  return {
    list,
    total: [{ total }],
    firstRecord: total ? offset + 1 : 0,
    lastRecord: Math.min(offset + limit, total),
  };
};
