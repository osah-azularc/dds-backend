import { Sequelize } from "sequelize";
import V2_5_Calendar from "../models/admin/v2_5_calendarModel.js";
import V2_5_Circuit from "../models/admin/v2_5_circuitModel.js";
import CasteTypeGroups from "../models/admin/casteTypeGroupsModel.js";

/**
 * Shared Sequelize include/order descriptors for the calendar service
 * modules (calendarService.js, calendarValidationService.js,
 * calendarHistoryService.js), split out so each module stays a manageable
 * size while declaring each association chain only once.
 */

// cal.circuit_id / cal.casetype_group_id are required (INNER JOIN semantics
// in the original raw SQL): if either FK doesn't resolve, the calendar is
// treated as not found. Used by getCalendarDetails and
// validateCountyCasetypeCombination.
export const REQUIRED_CIRCUIT_INCLUDE = {
  model: V2_5_Circuit,
  as: "circuit",
  attributes: ["name"],
  required: true,
};
export const REQUIRED_CASETYPE_GROUP_INCLUDE = {
  model: CasteTypeGroups,
  as: "casetypeGroupInfo",
  attributes: ["casetypegroup"],
  required: true,
};

// circuit/casetypeGroup aren't real columns on calendarhistory — they come
// from the linked v2_5_calendar row via the "calendar" association. Shared
// between getCalendarHistoryList's include (to select the values) and
// CALENDAR_HISTORY_SORT_COLUMNS (to order by them).
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

// Allowlist of sortable columns — guards against SQL injection via an
// unvalidated column name interpolated into ORDER BY. "created_time" must
// reference the raw column via Sequelize.col() rather than the bare
// attribute name: that name is also the alias given to the DATE_FORMAT(...)
// computed column in getCalendarHistoryList's attributes, and MySQL resolves
// a bare ORDER BY name against the SELECT list alias first, which would sort
// by the formatted display STRING (lexical order) instead of the real TIME
// value.
export const CALENDAR_HISTORY_SORT_COLUMNS = {
  created_time: [Sequelize.col("calendarhistory.created_time")],
  date: ["Date"],
  circuit: [CALENDAR_HISTORY_CALENDAR_INCLUDE, CALENDAR_HISTORY_CIRCUIT_INCLUDE, "name"],
  casetypeGroup: [CALENDAR_HISTORY_CALENDAR_INCLUDE, CALENDAR_HISTORY_CASETYPE_GROUP_INCLUDE, "casetypegroup"],
  modifiedBy: ["ModifiedBy"],
};
