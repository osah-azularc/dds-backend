import CalendarHistory from "../models/admin/calendarHistoryModel.js";
import V2_5_Calendar from "../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../models/admin/v2_5_calendarCasetypeModel.js";
import V2_5_Calendar_Hearing_Info from "../models/admin/v2_5_calendar_hearing_infoModel.js";
import caseTypes from "../models/admin/caseTypesModel.js";
import { REQUIRED_CIRCUIT_INCLUDE, REQUIRED_CASETYPE_GROUP_INCLUDE } from "./calendarIncludes.js";

/**
 * Calendar Service
 * Business logic for admin calendar add/update/delete, extracted from
 * adminCalendarController.js so the controller stays a thin request/response layer.
 *
 * County-casetype conflict validation lives in calendarValidationService.js
 * and the audit history list lives in calendarHistoryService.js (both
 * re-exported below) — split out to keep this module a manageable size while
 * the include/order descriptors they share live in calendarIncludes.js.
 */
export { validateCountyCasetypeCombination } from "./calendarValidationService.js";
export { getCalendarHistoryList } from "./calendarHistoryService.js";

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
    const casetypeInclude = {
      model: caseTypes,
      as: "casetype",
      attributes: ["Agencycode", "CaseCode"],
      required: false,
    };
    const casetypeLinkInclude = {
      model: V2_5_CalendarCasetype,
      as: "calendarCasetypes",
      // Sequelize needs at least the PK selected here to correctly hydrate
      // this hasMany association into an array — attributes: [] silently
      // leaves calendar.calendarCasetypes undefined instead.
      attributes: ["id"],
      required: false,
      include: [casetypeInclude],
    };

    const calendar = await V2_5_Calendar.findByPk(parseInt(calendarId), {
      attributes: ["id", "circuitId", "caseTypeGroupId"],
      include: [REQUIRED_CIRCUIT_INCLUDE, REQUIRED_CASETYPE_GROUP_INCLUDE, casetypeLinkInclude],
      order: [
        [casetypeLinkInclude, casetypeInclude, "Agencycode", "ASC"],
        [casetypeLinkInclude, casetypeInclude, "CaseCode", "ASC"],
      ],
    });

    if (!calendar) {
      return null;
    }

    // Format casetype data as "AGENCY-CASETYPE" comma-separated list
    const casetypeList = (calendar.calendarCasetypes || [])
      .map((link) => link.casetype)
      .filter((ct) => ct && ct.Agencycode && ct.CaseCode)
      .map((ct) => `${ct.Agencycode}-${ct.CaseCode}`)
      .join(", ");

    return {
      calendarDetails: {
        circuit: calendar.circuit.name,
        casetypeGroup: calendar.casetypeGroupInfo.casetypegroup,
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
