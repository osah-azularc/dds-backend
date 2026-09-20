// Job 1 (AC: "Cron Job 1 ... runs daily, on the day of hearing") - plants a minimal
// docket_caseid + hearing_date placeholder row in past_calendar_snapshot
// (active_past_calendar = '0') for every docket being heard today, so nothing is missed
// even if today's data changes later. Job 2 (pastCalendarActiveSnapshotService.js) fills
// these in and marks them Active the following day.
//
// Query shape mirrors checkinStartCheckinService.js's "today's dockets" query (same
// hearingDate-is-today + buildNotClosedCondition filter - a Closed docket only counts as
// today's if it was closed today too), then validates each row resolves to a real judge,
// CMA, county, casetype and hearing location the same way checkinInfoListService.js's
// INNER JOIN semantics do - a row that doesn't resolve is skipped rather than snapshotted
// with dangling/guessed references.
//
// Idempotent by design: a row already existing for (docket_caseid, hearing_date) is left
// alone (whether it's still an Inactive placeholder or has since gone Active), and the
// model's own unique index on that pair backstops a race between two overlapping runs
// (the scheduled run and a manual/backup re-run) landing on the same case at once.
import { Op } from "sequelize";
import Docket from "../../../../models/Docket.js";
import PastCalendarSnapshot from "../../../../models/PastCalendarSnapshot.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import County from "../../../../models/County.js";
import Casetypes from "../../../../models/Casetypes.js";
import CourtLocations from "../../../../models/CourtLocations.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  todayDateOnly,
  getTodayDateRange,
  buildNotClosedCondition,
  formatStaffConcat,
} from "./checkinSharedHelpers.js";

// Matches the "system/no acting user" convention already used for cron-originated
// checkin writes (see checkinCalendarHelper.js's pre-start-checkin stub insert).
const SYSTEM_CREATED_BY = 0;

// docket.hearingSite can hold several comma-separated site names on one case (see
// checkinCalendarListService.js's LIKE-match comment) - resolvable if ANY segment
// matches an active location, mirroring how a LIKE '%name%' filter would find it.
const hasResolvableLocation = (hearingSite, activeLocationNames) => {
  const segments = (hearingSite || "")
    .split(",")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  return segments.some((segment) => activeLocationNames.has(segment));
};

/**
 * Runs Job 1 - see file header. Returns a small summary object for logging/manual-
 * trigger responses; never throws for "nothing to do" (only for real query failures,
 * which the cron wrapper/controller already log and surface).
 */
export const runInactiveSnapshotJob = async () => {
  const today = todayDateOnly();
  const { todayStart, tomorrowStart } = getTodayDateRange();

  const docketRows = await Docket.findAll({
    where: {
      [Op.and]: [
        { hearingDate: { [Op.gte]: todayStart, [Op.lt]: tomorrowStart } },
        buildNotClosedCondition(today),
      ],
    },
    attributes: ["caseId", "refAgency", "caseType", "county", "hearingSite", "judge", "judgeAssistant"],
    raw: true,
  });

  if (!docketRows.length) {
    logger.info(`[PastCalendarInactiveSnapshot] No dockets hearing on ${today} - nothing to snapshot`);
    return { hearingDate: today, scanned: 0, inserted: 0, alreadyPresent: 0, unresolved: 0 };
  }

  const caseIds = docketRows.map((row) => row.caseId);
  const uniqueCounties = [...new Set(docketRows.map((row) => row.county).filter(Boolean))];
  const uniqueCaseCodes = [...new Set(docketRows.map((row) => row.caseType).filter(Boolean))];
  const uniqueAgencyCodes = [...new Set(docketRows.map((row) => row.refAgency).filter(Boolean))];

  const [countyRows, casetypeRows, activeJudges, activeCmas, activeLocations, existingSnapshots] =
    await Promise.all([
      County.findAll({
        where: { countyDescription: { [Op.in]: uniqueCounties } },
        attributes: ["countyId", "countyDescription"],
        raw: true,
      }),
      Casetypes.findAll({
        where: { caseCode: { [Op.in]: uniqueCaseCodes }, agencyCode: { [Op.in]: uniqueAgencyCodes } },
        attributes: ["caseTypeId", "caseCode", "agencyCode"],
        raw: true,
      }),
      JudgeAssistantClerk.findAll({
        where: { userType: "judge", isActive: "1" },
        attributes: ["firstName", "lastName"],
        raw: true,
      }),
      JudgeAssistantClerk.findAll({
        where: { userType: "cma", isActive: "1" },
        attributes: ["firstName", "lastName"],
        raw: true,
      }),
      CourtLocations.findAll({
        where: { isActive: "1" },
        attributes: ["locationName"],
        raw: true,
      }),
      PastCalendarSnapshot.findAll({
        where: { hearingDate: today, docketCaseId: { [Op.in]: caseIds } },
        attributes: ["docketCaseId"],
        raw: true,
      }),
    ]);

  const countyIdByDescription = new Map(countyRows.map((row) => [row.countyDescription, row.countyId]));
  const caseTypeIdByCodePair = new Map(
    casetypeRows.map((row) => [`${row.caseCode}|${row.agencyCode}`, row.caseTypeId]),
  );
  const judgeConcatSet = new Set(activeJudges.map(formatStaffConcat));
  const cmaConcatSet = new Set(activeCmas.map(formatStaffConcat));
  const activeLocationNames = new Set(
    activeLocations.map((row) => (row.locationName || "").trim().toLowerCase()).filter(Boolean),
  );
  // "Already present" regardless of active flag - Job 1 never re-plants a placeholder
  // Job 2 has already finalized, and never duplicates one it already planted itself.
  const existingCaseIds = new Set(existingSnapshots.map((row) => row.docketCaseId));

  let inserted = 0;
  let alreadyPresent = 0;
  let unresolved = 0;

  for (const docket of docketRows) {
    if (existingCaseIds.has(docket.caseId)) {
      alreadyPresent += 1;
      continue;
    }

    const resolvable =
      judgeConcatSet.has((docket.judge || "").trim()) &&
      cmaConcatSet.has((docket.judgeAssistant || "").trim()) &&
      countyIdByDescription.has(docket.county) &&
      caseTypeIdByCodePair.has(`${docket.caseType}|${docket.refAgency}`) &&
      hasResolvableLocation(docket.hearingSite, activeLocationNames);

    if (!resolvable) {
      unresolved += 1;
      continue;
    }

    try {
      // Deliberately ONLY these fields (see file header) - every other column stays
      // NULL so Job 2 can tell "not yet completed" apart from real data.
      await PastCalendarSnapshot.create({
        docketCaseId: docket.caseId,
        hearingDate: today,
        activePastCalendar: "0",
        createdDate: new Date(),
        createdBy: SYSTEM_CREATED_BY,
      });
      inserted += 1;
    } catch (error) {
      // SequelizeUniqueConstraintError - another concurrent run (scheduled + manual
      // backup re-run) inserted this same (docket_caseid, hearing_date) first. Treat as
      // the idempotent no-op it is rather than failing the whole job over it.
      if (error?.name === "SequelizeUniqueConstraintError") {
        alreadyPresent += 1;
      } else {
        throw error;
      }
    }
  }

  const summary = { hearingDate: today, scanned: docketRows.length, inserted, alreadyPresent, unresolved };
  logger.info(
    `[PastCalendarInactiveSnapshot] ${today}: scanned=${summary.scanned} inserted=${inserted} ` +
      `alreadyPresent=${alreadyPresent} unresolved=${unresolved}`,
  );
  return summary;
};
