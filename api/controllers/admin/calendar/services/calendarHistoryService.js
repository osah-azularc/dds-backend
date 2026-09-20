// Calendar audit history list, paginated and sorted, with circuit/casetype
// group resolved from the linked calendar. Equivalent to PHP
// getcalendarhistoryAction.
import { Op, Sequelize } from "sequelize";
import CalendarHistory from "../../../../models/admin/calendarHistoryModel.js";
import {
  CALENDAR_HISTORY_CALENDAR_INCLUDE,
  CALENDAR_HISTORY_SORT_FIELD_MAP,
} from "../calendarSortConfig.js";

/**
 * Get calendar history, paginated and sorted, with circuit/casetype group
 * resolved from the linked calendar. Equivalent to PHP getcalendarhistoryAction.
 * @returns {{data: Array, totalCount: number}}
 */
export const getCalendarHistoryList = async ({
  page,
  limit,
  isFrontendHistory,
  id,
  sortBy,
  sortOrder,
}) => {
  const offset = (page - 1) * limit;

  const where = {};
  if (isFrontendHistory !== undefined && isFrontendHistory !== null) {
    where.is_frontend_history = String(isFrontendHistory);
  }
  if (id) {
    where.CalendarId = parseInt(id);
    // Exclude history rows archived under the old calendar system, matching
    // the PHP model's `(is_old_cal != '1' OR is_old_cal IS NULL)` guard.
    where.is_old_cal = { [Op.or]: [{ [Op.ne]: "1" }, { [Op.is]: null }] };
  }

  // Sorting is applied at the DB level (ORDER BY before LIMIT/OFFSET), so it
  // covers all matching rows, not just the current page.
  // created_time is stored as a TIME column (no date part), so ordering by
  // it alone only sorts by time-of-day across all dates. Date must lead so
  // the newest rows are actually first; created_time only breaks ties within
  // the same day.
  const sortDirection = sortOrder === "desc" ? "DESC" : "ASC";
  const sortField = CALENDAR_HISTORY_SORT_FIELD_MAP[sortBy];
  const order =
    sortField && sortBy !== "Date"
      ? [[...sortField, sortDirection]]
      : [
          ["Date", sortField ? sortDirection : "DESC"],
          ["created_time", sortField ? sortDirection : "DESC"],
        ];

  // Fetch calendar history, paginated, with circuit/casetype group and
  // formatted dates computed directly in the query (no post-fetch mapping)
  const { count: totalCount, rows } = await CalendarHistory.findAndCountAll({
    where,
    attributes: [
      "auditid",
      "Date",
      ["CalendarId", "Calendarid"],
      "Description",
      ["ModifiedBy", "Modifiedby"],
      [
        Sequelize.fn("TIME_FORMAT", Sequelize.col("created_time"), "%h:%i %p"),
        "created_time",
      ],
      [
        // created_time is a bare TIME column with no date part, so formatting
        // it alone (as DATE_FORMAT with a date pattern) silently substitutes
        // today's date. Combine it with the row's own Date column instead,
        // matching the PHP model's
        // `cast(concat(Date, ' ', created_time) as datetime)`.
        Sequelize.cast(
          Sequelize.fn(
            "CONCAT",
            Sequelize.col("Date"),
            " ",
            Sequelize.col("created_time"),
          ),
          "datetime",
        ),
        "createdDate",
      ],
      [Sequelize.col("calendar.circuit.name"), "circuit"],
      [
        Sequelize.col("calendar.casetypeGroupInfo.casetypegroup"),
        "casetypeGroup",
      ],
    ],
    include: [CALENDAR_HISTORY_CALENDAR_INCLUDE],
    order,
    limit,
    offset,
    raw: true,
  });

  return { data: rows, totalCount };
};
