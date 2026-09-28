import { Op } from "sequelize";
import V2_5_Calendar from "../models/admin/v2_5_calendarModel.js";
import V2_5_CalendarCasetype from "../models/admin/v2_5_calendarCasetypeModel.js";
import caseTypes from "../models/admin/caseTypesModel.js";
import V2_5_CountyCircuitMap from "../models/admin/v2_5_countyCircuitMapModel.js";
import { REQUIRED_CIRCUIT_INCLUDE, REQUIRED_CASETYPE_GROUP_INCLUDE } from "./calendarIncludes.js";

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
  const notificationList = {};

  // Every county mapped to the requested circuit — equivalent to the
  // original raw SQL's `SELECT county_id FROM v2_5_county_circuit_map WHERE
  // circuit_id = :circuit_id` subquery.
  const countyMappings = await V2_5_CountyCircuitMap.findAll({
    where: { circuitId: parseInt(circuit_id) },
    attributes: ["countyId"],
    raw: true,
  });
  const countyIds = countyMappings.map((mapping) => mapping.countyId);

  if (countyIds.length === 0) {
    return notificationList;
  }

  // Every circuit that shares at least one of those counties (a county can
  // map to more than one circuit) — equivalent to the original query's join
  // `v2_5_county_circuit_map cncr ON cal.circuit_id = cncr.circuit_id` +
  // `WHERE cncr.county_id IN (...)`.
  const relatedCircuitMappings = await V2_5_CountyCircuitMap.findAll({
    where: { countyId: { [Op.in]: countyIds } },
    attributes: ["circuitId"],
    raw: true,
  });
  const relatedCircuitIds = [...new Set(relatedCircuitMappings.map((mapping) => mapping.circuitId))];

  // Existing calendars, in any of those circuits, that already use one of
  // the requested casetypes.
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
        include: [REQUIRED_CIRCUIT_INCLUDE, REQUIRED_CASETYPE_GROUP_INCLUDE],
      },
      { model: caseTypes, as: "casetype", attributes: ["Agencycode", "CaseCode"], required: true },
    ],
  });

  // Group by circuit + casetype group, deduplicated by agency + casetype —
  // equivalent to the original raw SQL's
  // `GROUP BY cr.name, ctg.casetypegroup, ct.agencycode, ct.casecode`.
  matches.forEach((match) => {
    const key = `${match.calendar.circuitId}-${match.calendar.caseTypeGroupId}`;

    if (!notificationList[key]) {
      notificationList[key] = {
        circuit: match.calendar.circuit.name,
        casetypeGroup: match.calendar.casetypeGroupInfo.casetypegroup,
        data: [],
      };
    }

    const agency = match.casetype.Agencycode;
    const casetype = match.casetype.CaseCode;
    const alreadyListed = notificationList[key].data.some(
      (entry) => entry.agency === agency && entry.casetype === casetype
    );
    if (!alreadyListed) {
      notificationList[key].data.push({ agency, casetype });
    }
  });

  // Original raw SQL's `ORDER BY ct.agencycode, ct.casecode`.
  Object.values(notificationList).forEach((entry) => {
    entry.data.sort(
      (a, b) => (a.agency || "").localeCompare(b.agency || "") || (a.casetype || "").localeCompare(b.casetype || "")
    );
  });

  return notificationList;
};
