// Calendar list query - circuit/casetype group/judge/CMA/hearing info,
// paginated and sorted. Converted from PHP calendarList.
import { Op } from "sequelize";
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../../../../models/admin/v2_5_calendarCasetypeModel.js";
import V2_5_Calendar_Hearing_Info from "../../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import {
  CALENDAR_CONDITION_FIELD_MAP,
  CALENDAR_LIST_CIRCUIT_INCLUDE,
  CALENDAR_LIST_CASETYPE_GROUP_INCLUDE,
  CALENDAR_SORT_FIELD_MAP,
  CALENDAR_AGGREGATE_SORT_FIELD_MAP,
  CALENDAR_LIST_HYDRATE_INCLUDE,
  SHORT_MONTH_NAMES,
} from "../calendarSortConfig.js";

/**
 * Get calendar list with circuit/casetype group/judge/CMA/hearing info,
 * paginated and sorted. Converted from PHP calendarList.
 * @returns {{data: Array, count: number}}
 */
export const getCalendarList = async ({
  condition = {},
  page,
  limit,
  sortBy,
  sortOrder,
}) => {
  const offset = (page - 1) * limit;
  const calendarWhere = {};

  // casetype_id/judge_id/cma_id aren't columns on v2_5_calendar - each is
  // resolved to a list of calendar ids first, then intersected so multiple
  // filters combine with AND semantics.
  let restrictedCalendarIds = null;
  const intersectCalendarIds = (ids) => {
    restrictedCalendarIds =
      restrictedCalendarIds === null
        ? ids
        : restrictedCalendarIds.filter((id) => ids.includes(id));
  };

  if (condition.casetype_id) {
    const casetypeRows = await V2_5_CalendarCasetype.findAll({
      where: { caseTypeId: condition.casetype_id },
      attributes: ["calendarId"],
      raw: true,
    });
    intersectCalendarIds(casetypeRows.map((row) => row.calendarId));
  }

  if (condition.judge_id) {
    const judgeRows = await V2_5_Calendar_Hearing_Info.findAll({
      where: { judgeId: condition.judge_id },
      attributes: ["calendarId"],
      raw: true,
    });
    intersectCalendarIds(judgeRows.map((row) => row.calendarId));
  }

  if (condition.cma_id) {
    const cmaRows = await V2_5_Calendar_Hearing_Info.findAll({
      where: { cmaId: condition.cma_id },
      attributes: ["calendarId"],
      raw: true,
    });
    intersectCalendarIds(cmaRows.map((row) => row.calendarId));
  }

  // judge_id/cma_id narrow which calendars qualify (above), but the
  // hydrate include below pulls every hearingInfos row for each qualifying
  // calendar. Without also scoping that include to the same judge/cma, a
  // calendar matched because ONE of its hearingInfos rows has the filtered
  // judge/cma would still show judges/cma/courtLocations/hearingTimes from
  // its OTHER, non-matching rows too. Reuse the shared include tree as-is
  // when no such filter is active, to avoid needlessly cloning it.
  const hearingInfosWhere = {};
  if (condition.judge_id) {
    hearingInfosWhere.judgeId = condition.judge_id;
  }
  if (condition.cma_id) {
    hearingInfosWhere.cmaId = condition.cma_id;
  }
  const hydrateInclude = Object.keys(hearingInfosWhere).length
    ? CALENDAR_LIST_HYDRATE_INCLUDE.map((inc) =>
        inc.as === "hearingInfos" ? { ...inc, where: hearingInfosWhere } : inc,
      )
    : CALENDAR_LIST_HYDRATE_INCLUDE;

  if (restrictedCalendarIds !== null) {
    if (restrictedCalendarIds.length === 0) {
      return { data: [], count: 0 };
    }
    calendarWhere.id = { [Op.in]: restrictedCalendarIds };
  }

  Object.entries(condition).forEach(([key, value]) => {
    const attribute = CALENDAR_CONDITION_FIELD_MAP[key];
    if (attribute && value !== undefined && value !== null) {
      calendarWhere[attribute] = value;
    }
  });

  const sortDirection = sortOrder === "desc" ? "DESC" : "ASC";
  const aggregateSortField = CALENDAR_AGGREGATE_SORT_FIELD_MAP[sortBy];

  let count;
  let rows;

  if (aggregateSortField) {
    // Resolve the sorted/paginated calendar ids via a GROUP BY query (see
    // comment on CALENDAR_AGGREGATE_SORT_FIELD_MAP), then hydrate full
    // calendar records for just that page.
    const groupedRows = await V2_5_Calendar.findAll({
      subQuery: false,
      attributes: ["id"],
      where: calendarWhere,
      include: aggregateSortField.include,
      group: ["v2_5_calendar.id"],
      raw: true,
    });
    count = groupedRows.length;

    const pageIdRows = await V2_5_Calendar.findAll({
      subQuery: false,
      attributes: ["id"],
      where: calendarWhere,
      include: aggregateSortField.include,
      group: ["v2_5_calendar.id"],
      order: [[aggregateSortField.orderExpr(), sortDirection]],
      limit,
      offset,
      raw: true,
    });
    const pageCalendarIds = pageIdRows.map((row) => row.id);

    const hydratedRows = pageCalendarIds.length
      ? await V2_5_Calendar.findAll({
          where: { id: { [Op.in]: pageCalendarIds } },
          include: hydrateInclude,
        })
      : [];

    // IN-clause results don't preserve order, so re-sort to match the page.
    const hydratedById = new Map(hydratedRows.map((cal) => [cal.id, cal]));
    rows = pageCalendarIds.map((id) => hydratedById.get(id)).filter(Boolean);
  } else {
    const directSortField = CALENDAR_SORT_FIELD_MAP[sortBy];
    const order = directSortField
      ? [[...directSortField, sortDirection]]
      : [
          [CALENDAR_LIST_CIRCUIT_INCLUDE, "name", "ASC"],
          [CALENDAR_LIST_CASETYPE_GROUP_INCLUDE, "casetypegroup", "ASC"],
        ];

    // Resolve the sorted/paginated calendar ids first, via a query that
    // only joins the belongsTo associations the order references (circuit/
    // casetypeGroup) - no hasMany hearingInfos. Sequelize's automatic
    // subquery-pagination doesn't reliably honor order-by-association-column
    // once a hasMany include shares the same query/limit (the same
    // limitation CALENDAR_AGGREGATE_SORT_FIELD_MAP works around above):
    // verified locally that circuits sort correctly with no limit, but with
    // limit=8/10/20 the first alphabetical circuits (Athens, Augusta) were
    // silently dropped from page 1 entirely. Hydrating in a second, separate
    // query - same pattern as the aggregate-sort branch - sidesteps it.
    const idResult = await V2_5_Calendar.findAndCountAll({
      attributes: ["id"],
      where: calendarWhere,
      include: [
        CALENDAR_LIST_CIRCUIT_INCLUDE,
        CALENDAR_LIST_CASETYPE_GROUP_INCLUDE,
      ],
      order,
      limit,
      offset,
      distinct: true,
    });
    count = idResult.count;
    const pageCalendarIds = idResult.rows.map((row) => row.id);

    const hydratedRows = pageCalendarIds.length
      ? await V2_5_Calendar.findAll({
          where: { id: { [Op.in]: pageCalendarIds } },
          include: hydrateInclude,
        })
      : [];

    // IN-clause results don't preserve order, so re-sort to match the page.
    const hydratedById = new Map(hydratedRows.map((cal) => [cal.id, cal]));
    rows = pageCalendarIds.map((id) => hydratedById.get(id)).filter(Boolean);
  }

  const currentYear = new Date().getFullYear();

  // Each row already carries its own hearingInfos, so there's no manual
  // flatten-then-group step like the raw SQL version needed.
  const data = rows.map((cal) => {
    const judges = [];
    const cma = [];
    const courtLocations = [];
    const hearingTimes = {};
    const hearingdate = {};

    (cal.hearingInfos || []).forEach((hr) => {
      const judgeName = hr.judge
        ? `${hr.judge.firstName} ${hr.judge.lastName}`
        : null;
      if (judgeName && !judges.includes(judgeName)) {
        judges.push(judgeName);
      }

      const cmaName = hr.cma ? `${hr.cma.firstName} ${hr.cma.lastName}` : null;
      if (cmaName && !cma.includes(cmaName)) {
        cma.push(cmaName);
      }

      const locationName = hr.courtLocation?.locationName;
      if (locationName && !courtLocations.includes(locationName)) {
        courtLocations.push(locationName);
      }

      if (hr.hearingTime?.hearingTime && hr.hearingTime?.hearingTimeStored) {
        const key =
          Number(String(hr.hearingTime.hearingTimeStored).replace(/:/g, "")) /
          100;
        hearingTimes[key] = hr.hearingTime.hearingTime;
      }

      if (hr.hearingDate) {
        const [yearStr, monthStr, dayStr] = hr.hearingDate.split("-");
        const year = Number(yearStr);

        if (year === currentYear) {
          const monthIndex = Number(monthStr) - 1;
          const day = Number(dayStr);
          const timestamp = Date.UTC(year, monthIndex, day) / 1000;
          hearingdate[timestamp] = `${SHORT_MONTH_NAMES[monthIndex]} ${day}`;
        }
      }
    });

    return {
      calendarId: cal.id,
      circuit_id: cal.circuitId,
      circuit: cal.circuit?.name || null,
      casetype_group_id: cal.caseTypeGroupId,
      casetypeGroup: cal.casetypeGroupInfo?.casetypegroup || null,
      judges,
      cma,
      courtLocations,
      hearingTimes,
      hearingdate,
    };
  });

  return { data, count };
};
