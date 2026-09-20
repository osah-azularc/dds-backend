// Cross-cutting helpers shared by the calendar/hearing-info service modules -
// calendar detail lookup, audit history logging, and the display/ISO date
// conversions the legacy PHP app used for hearingDate/cutoffDate.
import caseTypes from "../../../../models/admin/caseTypesModel.js";
import CalendarHistory from "../../../../models/admin/calendarHistoryModel.js";
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../../../../models/admin/v2_5_calendarCasetypeModel.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
  CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
} from "../calendarSortConfig.js";

/**
 * Get calendar details with circuit, casetype group, and casetype list.
 * Helper for calendar history descriptions.
 * @param {number} calendarId - Calendar ID
 * @returns {Object|null} Calendar details with formatted casetype data
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
      include: [
        CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
        CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
        casetypeLinkInclude,
      ],
      order: [
        [casetypeLinkInclude, casetypeInclude, "Agencycode", "ASC"],
        [casetypeLinkInclude, casetypeInclude, "CaseCode", "ASC"],
      ],
    });

    if (!calendar) {
      return null;
    }

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
    logger.error(`[getCalendarDetails]`, error);
    return null;
  }
};

/**
 * Logs calendar creation/update/removal to history table.
 * Convention (matching legacy CalendarModel::updateCalendarHistory): '1' =
 * hearing-level change (add/update/delete a hearing under a calendar) -
 * the default, since hearingInfoWriteService.js's callers all omit this
 * arg; '0' = calendar-level change (add/update/delete the calendar record
 * itself) - calendarCrudService.js's callers pass this explicitly. The
 * admin History screens read back '0' rows, the Calendar module's History
 * screens read back '1' rows (see HistoryTab.jsx in each module).
 * @param {string} description - HTML-formatted description of changes
 * @param {number} calendarId - Calendar ID
 * @param {string} modifiedBy - Username who made the change
 * @param {string} [isFrontendHistory="1"] - '1' hearing-level, '0' calendar-level
 */
export const updateCalendarHistory = async (
  description,
  calendarId,
  modifiedBy,
  isFrontendHistory = "1",
) => {
  try {
    const historyRecord = await CalendarHistory.create({
      Date: new Date(),
      Description: description,
      ModifiedBy: modifiedBy,
      CalendarId: parseInt(calendarId),
      is_frontend_history: String(isFrontendHistory),
      created_time: new Date(),
    });
    logger.info(
      `[updateCalendarHistory] saved auditid=${historyRecord.auditid}`,
    );
  } catch (error) {
    logger.error(`[updateCalendarHistory]`, error);
  }
};

// 'YYYY-MM-DD' (DATEONLY string) -> 'MM-DD-YYYY', matching the display format
// the old PHP app returned for hearingDate/cutoffDate.
export const toDisplayDate = (isoDate) => {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
};

// 'MM-DD-YYYY' -> 'YYYY-MM-DD' (DATEONLY string), inverse of toDisplayDate.
export const toIsoDate = (usDate) => {
  if (!usDate) return null;
  const [month, day, year] = usDate.split("-");
  return `${year}-${month}-${day}`;
};
