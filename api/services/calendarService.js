import { QueryTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import CalendarHistory from "../models/admin/calendarHistoryModel.js";
import V2_5_Calendar from "../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../models/admin/v2_5_calendarCasetypeModel.js";
import V2_5_Calendar_Hearing_Info from "../models/admin/v2_5_calendar_hearing_infoModel.js";

/**
 * Calendar Service
 * Business logic for admin calendar add/update/delete, extracted from
 * adminCalendarController.js so the controller stays a thin request/response layer.
 */

/**
 * Typed error a calendar service function can throw to signal a specific
 * HTTP status back to the controller (e.g. 404 for "not found"), instead of
 * every failure collapsing to a generic 500.
 */
export class CalendarServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "CalendarServiceError";
    this.statusCode = statusCode;
  }
}

/**
 * Get calendar details with circuit, casetype group, and casetype list.
 * Shared helper for calendar history — used by both add/update and delete flows.
 * @param {number} calendarId
 * @returns {Object|null} Calendar details with formatted casetype data, or null if not found/on error
 */
export const getCalendarDetails = async (calendarId) => {
  try {
    const results = await mysqlSequelize.query(
      `SELECT
        cal.id,
        cal.circuit_id,
        cal.casetype_group_id,
        cr.name as circuit,
        ctg.casetypegroup as casetypeGroup,
        ct.agencycode,
        ct.casecode
      FROM v2_5_calendar cal
      JOIN v2_5_circuit cr ON cal.circuit_id = cr.id
      JOIN casetypegroups ctg ON cal.casetype_group_id = ctg.id
      LEFT JOIN v2_5_calendar_casetype calct ON cal.id = calct.calendar_id
      LEFT JOIN casetypes ct ON calct.casetype_id = ct.casetypeid
      WHERE cal.id = :calendarId
      ORDER BY ct.agencycode, ct.casecode`,
      {
        replacements: { calendarId: parseInt(calendarId) },
        type: QueryTypes.SELECT,
      }
    );

    if (results.length === 0) {
      return null;
    }

    // Format casetype data as "AGENCY-CASETYPE" comma-separated list
    const casetypeList = results
      .filter((row) => row.agencycode && row.casecode)
      .map((row) => `${row.agencycode}-${row.casecode}`)
      .join(", ");

    return {
      calendarDetails: {
        circuit: results[0].circuit,
        casetypeGroup: results[0].casetypeGroup,
      },
      casetype_data: casetypeList,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Logs calendar creation/update/deletion to the history table.
 * @param {string} description - HTML-formatted description of changes
 * @param {number} calendarId
 * @param {string} modifiedBy
 * @param {number} isOldCal - Flag for old calendar (default: 0)
 */
export const updateCalendarHistory = async (description, calendarId, modifiedBy, isOldCal = 0) => {
  try {
    await CalendarHistory.create({
      Date: new Date(),
      Description: description,
      ModifiedBy: modifiedBy,
      CalendarId: parseInt(calendarId),
      is_old_cal: isOldCal,
      is_frontend_history: 1,
      created_time: new Date(),
    });
  } catch (error) {
    // Error updating calendar history
  }
};

/**
 * Adds or updates calendar information, including casetype mappings and history logging.
 * Converted from PHP function addUpdateCalendarInfo.
 * @param {Object} params
 * @param {number|string} [params.calendarId] - Existing calendar ID, if updating
 * @param {number|string} params.circuitId
 * @param {number|string} params.caseTypeGroupId
 * @param {Array} params.casetypes
 * @param {string} params.modifiedBy
 * @returns {{ calendarId: number, isUpdate: boolean }}
 */
export const addUpdateCalendarInfo = async ({
  calendarId,
  circuitId,
  caseTypeGroupId,
  casetypes,
  modifiedBy,
}) => {
  let lastCalendarId;
  let oldCalDetails = null;

  if (calendarId) {
    // UPDATE existing calendar
    // Get old calendar details before update for history
    oldCalDetails = await getCalendarDetails(calendarId);

    await V2_5_Calendar.update(
      { circuitId: parseInt(circuitId), caseTypeGroupId: parseInt(caseTypeGroupId) },
      { where: { id: parseInt(calendarId) } }
    );

    // Delete existing casetype mappings
    await V2_5_CalendarCasetype.destroy({ where: { calendarId: parseInt(calendarId) } });

    lastCalendarId = calendarId;
  } else {
    // INSERT new calendar
    const created = await V2_5_Calendar.create({
      circuitId: parseInt(circuitId),
      caseTypeGroupId: parseInt(caseTypeGroupId),
    });

    lastCalendarId = created.id;
  }

  // Insert casetype mappings
  await V2_5_CalendarCasetype.bulkCreate(
    casetypes.map((casetype) => ({
      calendarId: parseInt(lastCalendarId),
      caseTypeId: parseInt(typeof casetype === "object" ? casetype.id : casetype),
    }))
  );

  // Get new calendar details for history
  const calDetails = await getCalendarDetails(lastCalendarId);

  // Build history description HTML
  let calHistoryInfo = `<p>The following calendar has been ${
    calendarId ? "updated to" : "added"
  }:</p>
    <p>
      <b>County Circuit:</b> ${calDetails.calendarDetails.circuit},
      <b>Casetype Group:</b> ${calDetails.calendarDetails.casetypeGroup}
    </p>
    <p ${oldCalDetails ? 'class="history-title"' : ""}>
      <b>Casetype List:</b> ${calDetails.casetype_data}
    </p>`;

  // Add original calendar information for updates
  if (oldCalDetails) {
    calHistoryInfo += `<p>Original calendar information:</p>
      <p>
        <b>County Circuit:</b> ${oldCalDetails.calendarDetails.circuit},
        <b>Casetype Group:</b> ${oldCalDetails.calendarDetails.casetypeGroup}
      </p>
      <p>
        <b>Casetype List:</b> ${oldCalDetails.casetype_data}
      </p>`;
  }

  await updateCalendarHistory(calHistoryInfo, lastCalendarId, modifiedBy, 0);

  return { calendarId: lastCalendarId, isUpdate: Boolean(calendarId) };
};

/**
 * Deletes a calendar and all associated data (casetype mappings, hearing
 * info), logging the removal to calendar history.
 * Converted from PHP deleteCalendarInfoAction function.
 * @param {number|string} calendarId
 * @param {string} modifiedBy
 * @throws {CalendarServiceError} 404 if the calendar doesn't exist
 */
export const deleteCalendarInfo = async (calendarId, modifiedBy) => {
  // Get calendar details before deletion for history
  const calDetails = await getCalendarDetails(calendarId);

  if (!calDetails) {
    throw new CalendarServiceError(404, "Calendar not found");
  }

  await V2_5_CalendarCasetype.destroy({ where: { calendarId: parseInt(calendarId) } });
  await V2_5_Calendar_Hearing_Info.destroy({ where: { calendarId: parseInt(calendarId) } });
  await V2_5_Calendar.destroy({ where: { id: parseInt(calendarId) } });

  const calHistoryInfo = `<p>The following calendar has been removed:</p>
    <p>
      <b>County Circuit:</b> ${calDetails.calendarDetails.circuit},
      <b>Casetype Group:</b> ${calDetails.calendarDetails.casetypeGroup}
    </p>
    <p>
      <b>Casetype List:</b> ${calDetails.casetype_data}
    </p>`;

  await updateCalendarHistory(calHistoryInfo, calendarId, modifiedBy, 0);
};

/**
 * Validates if a county-casetype combination already exists in the calendar system.
 * Converted from PHP function isCountyCasetypeCombinationValid.
 * @param {Object} params
 * @param {number|string} params.circuit_id
 * @param {number[]} params.casetypeIds - Already parsed/validated casetype IDs
 * @param {number|string} [params.calendarId] - Excludes this calendar (when editing it)
 * @returns {Object} notificationList keyed by "circuit_id-casetype_group_id"
 */
export const validateCountyCasetypeCombination = async ({ circuit_id, casetypeIds, calendarId }) => {
  // Build the main query with joins - equivalent to the PHP function
  let sqlQuery = `
    SELECT
      cal.circuit_id,
      cal.casetype_group_id,
      calct.casetype_id,
      cr.name as circuit,
      ctg.casetypegroup as casetypeGroup,
      ct.casecode as casetype,
      ct.agencycode as agency
    FROM v2_5_calendar cal
    JOIN v2_5_calendar_casetype calct ON cal.id = calct.calendar_id
    JOIN v2_5_county_circuit_map cncr ON cal.circuit_id = cncr.circuit_id
    JOIN v2_5_circuit cr ON cal.circuit_id = cr.id
    JOIN casetypegroups ctg ON cal.casetype_group_id = ctg.id
    JOIN casetypes ct ON calct.casetype_id = ct.casetypeid
    WHERE cncr.county_id IN (
      SELECT county_id
      FROM v2_5_county_circuit_map
      WHERE circuit_id = :circuit_id
    )
    AND calct.casetype_id IN (:casetypeIds)
  `;

  // Add calendar exclusion if updating existing calendar
  if (calendarId) {
    sqlQuery += ` AND cal.id != :calendarId`;
  }

  sqlQuery += `
    GROUP BY cr.name, ctg.casetypegroup, ct.agencycode, ct.casecode
    ORDER BY ct.agencycode, ct.casecode
  `;

  const results = await mysqlSequelize.query(sqlQuery, {
    replacements: {
      circuit_id: parseInt(circuit_id),
      casetypeIds,
      ...(calendarId && { calendarId: parseInt(calendarId) }),
    },
    type: QueryTypes.SELECT,
  });

  // Process results into notification list format
  const notificationList = {};
  results.forEach((data) => {
    const key = `${data.circuit_id}-${data.casetype_group_id}`;

    if (!notificationList[key]) {
      notificationList[key] = {
        circuit: data.circuit,
        casetypeGroup: data.casetypeGroup,
        data: [],
      };
    }

    notificationList[key].data.push({
      agency: data.agency,
      casetype: data.casetype,
    });
  });

  return notificationList;
};

// Allowlist of sortable columns — guards against SQL injection via an
// unvalidated column name interpolated into ORDER BY.
const CALENDAR_HISTORY_SORT_COLUMNS = {
  created_time: "ch.created_time",
  date: "ch.Date",
  circuit: "cr.name",
  casetypeGroup: "ctg.casetypegroup",
  modifiedBy: "ch.Modifiedby",
};

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
  const sortColumn = CALENDAR_HISTORY_SORT_COLUMNS[sortBy] || CALENDAR_HISTORY_SORT_COLUMNS.created_time;
  const sortDirection = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const whereConditions = [];
  const replacements = { limit, offset };

  if (isFrontendHistory !== undefined) {
    whereConditions.push("ch.is_frontend_history = :isFrontendHistory");
    replacements.isFrontendHistory = parseInt(isFrontendHistory);
  }

  if (id) {
    whereConditions.push("ch.Calendarid = :id");
    replacements.id = parseInt(id);
  }

  const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Get total count for pagination
  const countResult = await mysqlSequelize.query(
    `SELECT COUNT(*) as total FROM calendarhistory ch ${whereClause}`,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );
  const totalCount = countResult[0].total;

  // Enhanced SQL query to include circuit and casetype group information with pagination
  const sql = `
    SELECT
      ch.auditid,
      ch.Date,
      ch.Calendarid,
      ch.Description,
      ch.Modifiedby,
      DATE_FORMAT(ch.created_time, '%h:%i %p') as created_time,
      DATE_FORMAT(ch.created_time, '%Y-%m-%d %H:%i:%s') as createdDate,
      cr.name as circuit,
      ctg.casetypegroup as casetypeGroup
    FROM calendarhistory ch
    LEFT JOIN v2_5_calendar cal ON ch.Calendarid = cal.id
    LEFT JOIN v2_5_circuit cr ON cal.circuit_id = cr.id
    LEFT JOIN casetypegroups ctg ON cal.casetype_group_id = ctg.id
    ${whereClause}
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT :limit OFFSET :offset
  `;

  const result = await mysqlSequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });

  // Clean up the description field to remove HTML and format properly
  const data = result.map((record) => ({
    ...record,
    Description: record.Description || "",
  }));

  return { data, totalCount };
};
