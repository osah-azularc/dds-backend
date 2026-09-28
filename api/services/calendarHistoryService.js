import { Sequelize } from "sequelize";
import CalendarHistory from "../models/admin/calendarHistoryModel.js";
import { CALENDAR_HISTORY_CALENDAR_INCLUDE, CALENDAR_HISTORY_SORT_COLUMNS } from "./calendarIncludes.js";

/**
 * Lists calendar history records (paginated, filterable, sortable), each
 * joined with its calendar's circuit/casetype group.
 * Equivalent to PHP getcalendarhistoryAction.
 * @param {Object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number|string} [params.isFrontendHistory] - Filter by is_frontend_history flag
 * @param {number|string} [params.id] - Filter to a single calendar's history
 * @param {string} [params.sortBy='created_time']
 * @param {string} [params.sortOrder='DESC']
 * @returns {{ data: Array, totalCount: number }}
 */
export const getCalendarHistoryList = async ({
  page = 1,
  limit = 10,
  isFrontendHistory,
  id,
  sortBy = "created_time",
  sortOrder = "DESC",
}) => {
  const offset = (page - 1) * limit;
  const sortField = CALENDAR_HISTORY_SORT_COLUMNS[sortBy] || CALENDAR_HISTORY_SORT_COLUMNS.created_time;
  const sortDirection = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const where = {};
  if (isFrontendHistory !== undefined) {
    where.is_frontend_history = parseInt(isFrontendHistory);
  }
  if (id) {
    where.CalendarId = parseInt(id);
  }

  // Get total count for pagination
  const totalCount = await CalendarHistory.count({ where });

  // Circuit/casetype group info with pagination
  const rows = await CalendarHistory.findAll({
    where,
    attributes: [
      "auditid",
      "Date",
      ["CalendarId", "Calendarid"],
      "Description",
      ["ModifiedBy", "Modifiedby"],
      [Sequelize.fn("DATE_FORMAT", Sequelize.col("calendarhistory.created_time"), "%h:%i %p"), "created_time"],
      [Sequelize.fn("DATE_FORMAT", Sequelize.col("calendarhistory.created_time"), "%Y-%m-%d %H:%i:%s"), "createdDate"],
      [Sequelize.col("calendar.circuit.name"), "circuit"],
      [Sequelize.col("calendar.casetypeGroupInfo.casetypegroup"), "casetypeGroup"],
    ],
    include: [CALENDAR_HISTORY_CALENDAR_INCLUDE],
    order: [[...sortField, sortDirection]],
    limit,
    offset,
    // The LIMIT/OFFSET must page calendarhistory rows directly; Sequelize's
    // automatic subquery-pagination (triggered whenever limit + include are
    // both present) would otherwise wrap this oddly given the nested
    // circuit/casetype-group joins used only for SELECT/ORDER BY here.
    subQuery: false,
    raw: true,
  });

  // Clean up the description field to remove HTML and format properly
  const data = rows.map((record) => ({
    ...record,
    Description: record.Description || "",
  }));

  return { data, totalCount };
};
