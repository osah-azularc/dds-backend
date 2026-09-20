// Shared "search-id -> docket free-text match value(s)" resolvers, used by
// every calendar search endpoint that accepts the CheckInTab-style dropdown
// ids (court_location_id, circuit_id, casetype_id, judge_id, cma_id) but has
// to filter the `docket` table, which predates those ID-based lookup tables
// and only stores the resolved text values. Originally written for
// checkinCalendarListService.js (Today's Check-In calendar); extracted here
// so pastCalendarListService.js (Past Calendar search) can share the exact
// same id -> docket-column-value resolution instead of re-deriving it.
//
// See checkinCalendarListService.js's file header for the full mapping
// rationale:
//   - casetype_id (an individual Casetypes.caseTypeId, matching
//     CalendarManagementTab's own "Casetype" dropdown) -> {caseCode,
//     agencyCode} pair
//   - circuit_id (a v2_5_circuit id)   -> v2_5_county_circuit_map -> county
//     -> county description(s)
//   - court_location_id               -> courtlocations -> location name
//   - judge_id / cma_id (a
//     judge_assistant_clerk user id)   -> "LastName FirstName" concat
//     (matches JudgeAssistantClerk's judgeAssistantClerkConcat virtual field)
import { Op } from "sequelize";
import CourtLocations from "../../../../models/CourtLocations.js";
import County from "../../../../models/County.js";
import V2_5_CountyCircuitMap from "../../../../models/admin/v2_5_countyCircuitMapModel.js";
import Casetypes from "../../../../models/Casetypes.js";
import { resolveStaffConcat as resolveStaffConcatOrNull } from "./checkinSharedHelpers.js";

// Returned by the resolvers below when an id was supplied but resolved to
// zero underlying rows, so the caller can short-circuit to an empty result
// instead of running a Docket query with a filter that (if simply omitted)
// would incorrectly match everything.
export const NO_MATCH = Symbol("NO_MATCH");

/** casetype_id (an individual Casetypes.caseTypeId) -> [{caseType, refAgency}]
 * Docket match pair. Docket.caseType/refAgency already store the exact
 * caseCode/agencyCode pair for one casetype, so a direct Casetypes lookup by
 * primary key is enough - no casetype-group hop needed. */
export const resolveCasetypeFilter = async (casetypeId) => {
  const casetype = await Casetypes.findByPk(casetypeId, {
    attributes: ["caseCode", "agencyCode"],
  });
  if (!casetype) return NO_MATCH;
  return [{ caseType: casetype.caseCode, refAgency: casetype.agencyCode }];
};

/** circuit_id (v2_5_circuit id) -> [countyDescription, ...] Docket.county match list */
export const resolveCircuitFilter = async (circuitId) => {
  const mapRows = await V2_5_CountyCircuitMap.findAll({
    where: { circuitId },
    attributes: ["countyId"],
    raw: true,
  });
  const countyIds = mapRows.map((row) => row.countyId).filter(Boolean);
  if (!countyIds.length) return NO_MATCH;

  const countyRows = await County.findAll({
    where: { countyId: { [Op.in]: countyIds } },
    attributes: ["countyDescription"],
    raw: true,
  });
  const names = countyRows.map((row) => row.countyDescription).filter(Boolean);
  return names.length ? names : NO_MATCH;
};

/** court_location_id -> locationName (used for a LIKE match against Docket.hearingSite,
 * which can store multiple comma-separated site names on one case) */
export const resolveLocationFilter = async (courtLocationId) => {
  const location = await CourtLocations.findByPk(courtLocationId, {
    attributes: ["locationName"],
  });
  return location?.locationName || NO_MATCH;
};

/** judge_id/cma_id (judge_assistant_clerk user id) -> "LastName FirstName" concat string */
export const resolveStaffFilter = async (userId) => {
  const concat = await resolveStaffConcatOrNull(userId);
  return concat === null ? NO_MATCH : concat;
};
