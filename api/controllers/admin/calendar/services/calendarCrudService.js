// Calendar record CRUD - create/update, delete, single-record fetch for
// editing. Converted from PHP addUpdateCalendarInfo / deleteCalendarInfoAction
// and calendar detail lookups. County-casetype conflict validation lives in
// calendarValidationService.js.
import caseTypes from "../../../../models/admin/caseTypesModel.js";
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../../../../models/admin/v2_5_calendarCasetypeModel.js";
import V2_5_Calendar_Hearing_Info from "../../../../models/admin/v2_5_calendar_hearing_infoModel.js";
import {
  CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
  CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
} from "../calendarSortConfig.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { getCalendarDetails, updateCalendarHistory } from "./calendarHelpers.js";

/**
 * Add or update calendar information. Converted from PHP addUpdateCalendarInfo.
 * @returns {{calendarId: number, isUpdate: boolean}}
 */
export const addUpdateCalendarInfo = async ({
  calendarId,
  circuit_id: circuitId,
  casetype_group_id: casetypeGroupId,
  casetypes,
  modifiedBy,
}) => {
  if (
    !circuitId ||
    !casetypeGroupId ||
    !casetypes ||
    !Array.isArray(casetypes)
  ) {
    throw new CalendarServiceError(
      400,
      "circuit_id, casetype_group_id, and casetypes array are required",
    );
  }

  let lastCalendarId;
  let oldCalDetails = null;

  if (calendarId) {
    oldCalDetails = await getCalendarDetails(calendarId);

    await V2_5_Calendar.update(
      {
        circuitId: parseInt(circuitId),
        caseTypeGroupId: parseInt(casetypeGroupId),
      },
      { where: { id: parseInt(calendarId) } },
    );

    await V2_5_CalendarCasetype.destroy({
      where: { calendarId: parseInt(calendarId) },
    });

    lastCalendarId = calendarId;
  } else {
    const newCalendar = await V2_5_Calendar.create({
      circuitId: parseInt(circuitId),
      caseTypeGroupId: parseInt(casetypeGroupId),
    });

    lastCalendarId = newCalendar.id;
  }

  await V2_5_CalendarCasetype.bulkCreate(
    casetypes.map((casetype) => ({
      calendarId: parseInt(lastCalendarId),
      caseTypeId: parseInt(
        typeof casetype === "object" ? casetype.id : casetype,
      ),
    })),
  );

  const calDetails = await getCalendarDetails(lastCalendarId);

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

  await updateCalendarHistory(calHistoryInfo, lastCalendarId, modifiedBy, "0");

  return { calendarId: lastCalendarId, isUpdate: Boolean(calendarId) };
};

/**
 * Delete calendar information and all associated data (casetypes, hearing
 * info). Converted from PHP deleteCalendarInfoAction.
 */
export const deleteCalendarInfo = async (calendarId, modifiedBy) => {
  if (!calendarId) {
    throw new CalendarServiceError(400, "calendar_id is required");
  }

  const calDetails = await getCalendarDetails(calendarId);

  if (!calDetails) {
    throw new CalendarServiceError(404, "Calendar not found");
  }

  await V2_5_CalendarCasetype.destroy({
    where: { calendarId: parseInt(calendarId) },
  });
  await V2_5_Calendar_Hearing_Info.destroy({
    where: { calendarId: parseInt(calendarId) },
  });
  await V2_5_Calendar.destroy({ where: { id: parseInt(calendarId) } });

  const calHistoryInfo = `<p>The following calendar has been removed:</p>
      <p>
        <b>County Circuit:</b> ${calDetails.calendarDetails.circuit},
        <b>Casetype Group:</b> ${calDetails.calendarDetails.casetypeGroup}
      </p>
      <p>
        <b>Casetype List:</b> ${calDetails.casetype_data}
      </p>`;

  await updateCalendarHistory(calHistoryInfo, calendarId, modifiedBy, "0");
};

/**
 * Get complete calendar information (circuit, casetype group, casetypes) by
 * ID, for editing.
 */
export const getCalendarDetailsById = async (calendarId) => {
  if (!calendarId) {
    throw new CalendarServiceError(400, "Calendar ID is required");
  }

  const calendarInfo = await V2_5_Calendar.findByPk(parseInt(calendarId), {
    attributes: ["id", "circuitId", "caseTypeGroupId"],
    include: [
      CALENDAR_REQUIRED_CIRCUIT_INCLUDE,
      CALENDAR_REQUIRED_CASETYPE_GROUP_INCLUDE,
    ],
  });

  if (!calendarInfo) {
    throw new CalendarServiceError(404, "Calendar not found");
  }

  const casetypeInclude = {
    model: caseTypes,
    as: "casetype",
    attributes: ["Casetypeid", "Agencycode", "CaseCode"],
    required: true,
  };
  const casetypeLinks = await V2_5_CalendarCasetype.findAll({
    where: { calendarId: parseInt(calendarId) },
    include: [casetypeInclude],
    order: [
      [casetypeInclude, "Agencycode", "ASC"],
      [casetypeInclude, "CaseCode", "ASC"],
    ],
  });

  const casetypes = casetypeLinks.map((link) => ({
    id: link.casetype.Casetypeid,
    agencycode: link.casetype.Agencycode,
    casecode: link.casetype.CaseCode,
    name: `${link.casetype.Agencycode} | ${link.casetype.CaseCode}`,
  }));

  return {
    calendarId: calendarInfo.id,
    circuit_id: calendarInfo.circuitId,
    circuit: calendarInfo.circuit.name,
    casetype_group_id: calendarInfo.caseTypeGroupId,
    casetypeGroup: calendarInfo.casetypeGroupInfo.casetypegroup,
    casetypes,
  };
};
