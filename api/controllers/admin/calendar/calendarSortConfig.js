import CasteTypeGroups from "../../../models/admin/casteTypeGroupsModel.js";
import V2_5_Circuit from "../../../models/admin/v2_5_circuitModel.js";
import V2_5_Calendar from "../../../models/admin/v2_5_calendarModel.js";
import V2_5_Calendar_Hearing_Info from "../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import HearingTime from "../../../models/calendar/HearingTimeModel.js";
import JudgeAssistantClerk from "../../../models/JudgeAssistantClerk.js";
import CourtLocations from "../../../models/CourtLocations.js";
import { Sequelize } from "sequelize";

// A calendar's own circuit/casetypeGroup are required (INNER JOIN semantics):
// if either FK doesn't resolve, the calendar is treated as not found. Shared
// between getCalendarDetails and getCalendarDetailsById.
export const CALENDAR_REQUIRED_CIRCUIT_INCLUDE = {
  model: V2_5_Circuit,
  as: "circuit",
  attributes: ["name"],
  required: true,
};
export const CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE = {
  model: CasteTypeGroups,
  as: "casetypeGroupInfo",
  attributes: ["casetypegroup"],
  required: true,
};

// Only these condition keys are honored; anything else is ignored rather than
// interpolated into the query, since condition comes straight from req.body.
export const CALENDAR_CONDITION_FIELD_MAP = {
  circuit_id: "circuitId",
  casetype_group_id: "caseTypeGroupId",
};

// Shared circuit/casetypeGroup association descriptors for v2_5_calendar,
// reused across CALENDAR_SORT_FIELD_MAP, calendarList's default order, and
// CALENDAR_LIST_HYDRATE_INCLUDE so the association chain is declared once.
export const CALENDAR_LIST_CIRCUIT_INCLUDE = {
  model: V2_5_Circuit,
  as: "circuit",
  attributes: ["name"],
};
export const CALENDAR_LIST_CASETYPE_GROUP_INCLUDE = {
  model: CasteTypeGroups,
  as: "casetypeGroupInfo",
  attributes: ["casetypegroup"],
};

// countyCircuit/caseTypeGroup are plain belongsTo associations on
// v2_5_calendar, so calendarList can order by them directly in its main
// paginated query (Sequelize's automatic subquery-pagination joins
// belongsTo/hasOne associations into that inner query).
export const CALENDAR_SORT_FIELD_MAP = {
  countyCircuit: [CALENDAR_LIST_CIRCUIT_INCLUDE, "name"],
  caseTypeGroup: [CALENDAR_LIST_CASETYPE_GROUP_INCLUDE, "casetypegroup"],
};

// judges/cmas/hearingLocation/times are multi-valued (one calendar can have
// several hearingInfos rows), so each sorts by a MIN() aggregate across that
// calendar's hearingInfos. hearingInfos is a hasMany association, and
// Sequelize's automatic subquery-pagination only ever joins belongsTo/hasOne
// associations into its inner id-selecting subquery — a hasMany-derived
// order value can't be resolved there. So calendarList resolves these sorts
// via a separate GROUP BY query instead of ordering the main paginated query
// directly (see calendarService.getCalendarList).
export const CALENDAR_AGGREGATE_SORT_FIELD_MAP = {
  judges: {
    include: [
      {
        model: V2_5_Calendar_Hearing_Info,
        as: "hearingInfos",
        attributes: [],
        required: false,
        include: [
          { model: JudgeAssistantClerk, as: "judge", attributes: [], required: false },
        ],
      },
    ],
    orderExpr: () =>
      Sequelize.fn(
        "MIN",
        Sequelize.fn(
          "CONCAT",
          Sequelize.col("hearingInfos.judge.firstName"),
          " ",
          Sequelize.col("hearingInfos.judge.lastName"),
        ),
      ),
  },
  cmas: {
    include: [
      {
        model: V2_5_Calendar_Hearing_Info,
        as: "hearingInfos",
        attributes: [],
        required: false,
        include: [
          { model: JudgeAssistantClerk, as: "cma", attributes: [], required: false },
        ],
      },
    ],
    orderExpr: () =>
      Sequelize.fn(
        "MIN",
        Sequelize.fn(
          "CONCAT",
          Sequelize.col("hearingInfos.cma.firstName"),
          " ",
          Sequelize.col("hearingInfos.cma.lastName"),
        ),
      ),
  },
  hearingLocation: {
    include: [
      {
        model: V2_5_Calendar_Hearing_Info,
        as: "hearingInfos",
        attributes: [],
        required: false,
        include: [
          { model: CourtLocations, as: "courtLocation", attributes: [], required: false },
        ],
      },
    ],
    orderExpr: () =>
      Sequelize.fn("MIN", Sequelize.col("hearingInfos.courtLocation.locationName")),
  },
  times: {
    include: [
      {
        model: V2_5_Calendar_Hearing_Info,
        as: "hearingInfos",
        attributes: [],
        required: false,
        include: [
          { model: HearingTime, as: "hearingTime", attributes: [], required: false },
        ],
      },
    ],
    // Sequelize.col() takes the literal DB column name, not the JS attribute
    // alias — the hearingtime table's stored-time column is actually spelled
    // "heringtimestored" (pre-existing typo in the schema, not touched here).
    orderExpr: () =>
      Sequelize.fn("MIN", Sequelize.col("hearingInfos.hearingTime.heringtimestored")),
  },
};

// Full include tree for hydrating calendarList rows once the page's calendar
// ids are known (either directly from findAndCountAll, or from the
// GROUP BY query for aggregate-sorted fields).
export const CALENDAR_LIST_HYDRATE_INCLUDE = [
  CALENDAR_LIST_CIRCUIT_INCLUDE,
  CALENDAR_LIST_CASETYPE_GROUP_INCLUDE,
  {
    model: V2_5_Calendar_Hearing_Info,
    as: "hearingInfos",
    required: false,
    attributes: ["judgeId", "cmaId", "courtLocationId", "hearingDate", "timeId"],
    include: [
      {
        model: JudgeAssistantClerk,
        as: "judge",
        attributes: ["firstName", "lastName"],
        required: false,
      },
      {
        model: JudgeAssistantClerk,
        as: "cma",
        attributes: ["firstName", "lastName"],
        required: false,
      },
      {
        model: CourtLocations,
        as: "courtLocation",
        attributes: ["locationName"],
        required: false,
      },
      {
        model: HearingTime,
        as: "hearingTime",
        attributes: ["hearingTime", "hearingTimeStored"],
        required: false,
      },
    ],
  },
];

// circuit/casetypeGroup aren't real columns on calendarhistory (they come
// from the linked v2_5_calendar row via the "calendar" association). These
// descriptors are shared between getCalendarHistoryList's include (to select
// the values) and CALENDAR_HISTORY_SORT_FIELD_MAP (to order by them) so the
// association chain is only declared once.
export const CALENDAR_HISTORY_CIRCUIT_INCLUDE = {
  model: V2_5_Circuit,
  as: "circuit",
  attributes: [],
  required: false,
};
export const CALENDAR_HISTORY_CASETYPE_GROUP_INCLUDE = {
  model: CasteTypeGroups,
  as: "casetypeGroupInfo",
  attributes: [],
  required: false,
};
export const CALENDAR_HISTORY_CALENDAR_INCLUDE = {
  model: V2_5_Calendar,
  as: "calendar",
  attributes: [],
  required: false,
  include: [CALENDAR_HISTORY_CIRCUIT_INCLUDE, CALENDAR_HISTORY_CASETYPE_GROUP_INCLUDE],
};

export const CALENDAR_HISTORY_SORT_FIELD_MAP = {
  Date: ["Date"],
  created_time: ["created_time"],
  Description: ["Description"],
  Modifiedby: ["ModifiedBy"],
  Calendarid: ["CalendarId"],
  circuit: [
    CALENDAR_HISTORY_CALENDAR_INCLUDE,
    CALENDAR_HISTORY_CIRCUIT_INCLUDE,
    "name",
  ],
  casetypeGroup: [
    CALENDAR_HISTORY_CALENDAR_INCLUDE,
    CALENDAR_HISTORY_CASETYPE_GROUP_INCLUDE,
    "casetypegroup",
  ],
};

// Hearing info list (Calendar > View Details screen): each row IS a single
// v2_5_calendar_hearing_info record, so judge/cma/location/time are plain
// belongsTo associations here (unlike calendarList, where they're aggregated
// across a calendar's many hearingInfos) and can be sorted directly in the
// main paginated query.
export const HEARING_INFO_JUDGE_INCLUDE = {
  model: JudgeAssistantClerk,
  as: "judge",
  attributes: ["firstName", "lastName"],
  required: false,
};
export const HEARING_INFO_CMA_INCLUDE = {
  model: JudgeAssistantClerk,
  as: "cma",
  attributes: ["firstName", "lastName"],
  required: false,
};
export const HEARING_INFO_LOCATION_INCLUDE = {
  model: CourtLocations,
  as: "courtLocation",
  attributes: ["locationName"],
  required: false,
};
export const HEARING_INFO_TIME_INCLUDE = {
  model: HearingTime,
  as: "hearingTime",
  attributes: ["hearingTime", "hearingTimeStored"],
  required: false,
};

export const HEARING_INFO_LIST_INCLUDE = [
  HEARING_INFO_JUDGE_INCLUDE,
  HEARING_INFO_CMA_INCLUDE,
  HEARING_INFO_LOCATION_INCLUDE,
  HEARING_INFO_TIME_INCLUDE,
];

export const HEARING_INFO_SORT_FIELD_MAP = {
  hearingDate: ["hearingDate"],
  cutoffDate: ["cutoffDate"],
  no_of_cases: ["noOfCases"],
  judge: [HEARING_INFO_JUDGE_INCLUDE, "lastName"],
  cma: [HEARING_INFO_CMA_INCLUDE, "lastName"],
  hearingtime: [HEARING_INFO_TIME_INCLUDE, "hearingTime"],
  court_location: [HEARING_INFO_LOCATION_INCLUDE, "locationName"],
};

export const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
