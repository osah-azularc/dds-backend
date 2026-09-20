// County-casetype conflict validation for the calendar create/update form.
// Converted from PHP isCountyCasetypeCombinationValid.
import { Op } from "sequelize";
import caseTypes from "../../../../models/admin/caseTypesModel.js";
import V2_5_CountyCircuitMap from "../../../../models/admin/v2_5_countyCircuitMapModel.js";
import V2_5_Calendar from "../../../../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../../../../models/admin/v2_5_calendarCasetypeModel.js";
import {
  CALENDAR_LIST_CIRCUIT_INCLUDE,
  CALENDAR_LIST_CASETYPE_GROUP_INCLUDE,
} from "../calendarSortConfig.js";
import { CalendarServiceError } from "./calendarServiceError.js";

/**
 * Validates if county-casetype combination already exists in calendar system.
 * Converted from PHP isCountyCasetypeCombinationValid.
 * @returns {Object} notificationList keyed by "circuitId-caseTypeGroupId"
 */
export const validateCountyCasetypeCombination = async ({
  circuit_id: circuitId,
  casetypes,
  calendarId,
}) => {
  if (!circuitId || !casetypes || !Array.isArray(casetypes)) {
    throw new CalendarServiceError(
      400,
      "circuit_id and casetypes array are required",
    );
  }

  const casetypeIds = casetypes
    .map((id) => parseInt(id))
    .filter((id) => !isNaN(id));

  if (casetypeIds.length === 0) {
    throw new CalendarServiceError(400, "Valid casetype IDs are required");
  }

  const circuitIdInt = parseInt(circuitId);

  // Find every circuit that shares at least one county with the requested
  // circuit (a county can be mapped to more than one circuit)
  const countyMappings = await V2_5_CountyCircuitMap.findAll({
    where: { circuitId: circuitIdInt },
    attributes: ["countyId"],
    raw: true,
  });
  const countyIds = countyMappings.map((mapping) => mapping.countyId);

  const notificationList = {};

  if (countyIds.length > 0) {
    const relatedCircuitMappings = await V2_5_CountyCircuitMap.findAll({
      where: { countyId: { [Op.in]: countyIds } },
      attributes: ["circuitId"],
      raw: true,
    });
    const relatedCircuitIds = [
      ...new Set(relatedCircuitMappings.map((mapping) => mapping.circuitId)),
    ];

    // Find existing calendars, in any of those circuits, that already use one
    // of the requested casetypes - equivalent to the PHP conflict-check function
    const matches = await V2_5_CalendarCasetype.findAll({
      where: { caseTypeId: { [Op.in]: casetypeIds } },
      include: [
        {
          model: V2_5_Calendar,
          as: "calendar",
          required: true,
          where: {
            circuitId: { [Op.in]: relatedCircuitIds },
            ...(calendarId && { id: { [Op.ne]: parseInt(calendarId) } }),
          },
          include: [
            CALENDAR_LIST_CIRCUIT_INCLUDE,
            CALENDAR_LIST_CASETYPE_GROUP_INCLUDE,
          ],
        },
        {
          model: caseTypes,
          as: "casetype",
          attributes: ["Agencycode", "CaseCode"],
        },
      ],
    });

    // Process matches into notification list format, grouped by circuit +
    // casetype group and deduplicated by agency + casetype
    matches.forEach((match) => {
      const key = `${match.calendar.circuitId}-${match.calendar.caseTypeGroupId}`;

      if (!notificationList[key]) {
        notificationList[key] = {
          circuit: match.calendar.circuit?.name,
          casetypeGroup: match.calendar.casetypeGroupInfo?.casetypegroup,
          data: [],
        };
      }

      const agency = match.casetype?.Agencycode;
      const casetype = match.casetype?.CaseCode;
      const alreadyListed = notificationList[key].data.some(
        (entry) => entry.agency === agency && entry.casetype === casetype,
      );
      if (!alreadyListed) {
        // Pre-formatted for direct display, matching getCalendarDetailsById's
        // casetypes.name shape ("Agency | CaseCode").
        notificationList[key].data.push({
          agency,
          casetype,
          name: `${agency || ""} | ${casetype || ""}`,
        });
      }
    });

    Object.values(notificationList).forEach((entry) => {
      entry.data.sort(
        (a, b) =>
          (a.agency || "").localeCompare(b.agency || "") ||
          (a.casetype || "").localeCompare(b.casetype || ""),
      );
    });
  }

  return notificationList;
};
