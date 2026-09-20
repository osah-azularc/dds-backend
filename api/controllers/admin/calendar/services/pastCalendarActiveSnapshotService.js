// Job 2 (AC: "Cron Job 2 ... runs daily, the following day after midnight") - completes
// yesterday's past_calendar_snapshot placeholder rows (planted by Job 1, see
// pastCalendarInactiveSnapshotService.js) with the full end-of-day state and flips them
// to active_past_calendar = '1', the permanent frozen record. Also copies each party's
// final attendance status into past_calendar_attendance_history.
//
// Sequencing dependency on Job 1 is entirely data-driven: this only ever looks at
// past_calendar_snapshot rows where hearing_date = yesterday AND active_past_calendar =
// '0' - rows Job 1 already planted and nobody's finalized yet. If Job 1 never ran for a
// given date, that WHERE clause matches nothing and this job silently no-ops for that
// date. KNOWN WEAKNESS (flagged per the design spec, not fixed here): there is no
// explicit lock or alert wired to that gap - a silent Job 1 failure produces a silent
// Job 2 no-op with no error surfaced anywhere. Worth adding monitoring/alerting on
// "Job 1 ran with 0 rows to complete" separately from this change.
//
// Field-fill rules (see design spec for the full rationale):
//   - docket_status and docket_caseid always come straight from the master docket table
//     (source of truth for status - this is also where any same-day disposition/
//     continuance/NOH "designation action" ends up, since those all write docket.status).
//   - case_name/judge/cma/hearing_site/hearing_time/case_type/county/notes/agency/
//     agency_reference_number: COALESCE(checkin_calendar_today_date value, docket value)
//     - whichever was actually edited/entered during check-in wins, otherwise the
//     originally-scheduled docket value.
//   - petitioner/respondent attorney, case official, attendance_status, pet_or_rep,
//     circuit_id, casetype_id: branch on isCheckinFeature (a checkin row exists AND has
//     a resolved active judge) - if used, read straight off the checkin row (already
//     resolved during the day); if not, re-derive via the same
//     agencycaseworkerbycase/attorneybycase/peopledetails/county/casetype lookups
//     checkinStartCheckinService.js uses for a fresh "Start Check-in".
//
// Idempotent by design: the completing UPDATE's own WHERE guards on
// active_past_calendar = '0' AND judge_name IS NULL, so a row already finalized (or
// mid-finalization by a concurrent run) simply doesn't match and is skipped - no
// re-processing, and the attendance-history copy (guarded by its own unique index) only
// runs when this run's UPDATE actually affected the row.
import { Op } from "sequelize";
import Docket from "../../../../models/Docket.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import PastCalendarSnapshot from "../../../../models/PastCalendarSnapshot.js";
import PastCalendarAttendanceHistory from "../../../../models/PastCalendarAttendanceHistory.js";
import AttendanceStatusTodayDate from "../../../../models/AttendanceStatusTodayDate.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import County from "../../../../models/County.js";
import Casetypes from "../../../../models/Casetypes.js";
import AgencyCaseworkerByCase from "../../../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../../../models/AttorneyByCase.js";
import PeopleDetails from "../../../../models/PeopleDetails.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  yesterdayDateOnly,
  formatStaffConcat,
  formatPartyName,
  pickCaseOfficial,
  pickPetitionerOrRepresentative,
} from "./checkinSharedHelpers.js";

const SYSTEM_CREATED_BY = 0;

// party_type -> which final (already coalesced/resolved) field carries that party's name.
const ATTENDANCE_HISTORY_PARTY_TYPES = [
  { partyType: "Petitioner", nameField: "caseName" },
  { partyType: "Petitioner Attorney", nameField: "petitionerAttorney" },
  { partyType: "Respondent Attorney", nameField: "respondentAttorney" },
  { partyType: "Case Worker", nameField: "caseOfficial" },
];

const coalesce = (checkinValue, docketValue) => {
  const trimmedCheckin = typeof checkinValue === "string" ? checkinValue.trim() : checkinValue;
  return trimmedCheckin || docketValue || null;
};

/**
 * Builds the branch-resolved fields (attorneys/official/attendance/petOrRep/circuit/
 * casetype) for a docket that never went through the digital check-in flow - the same
 * lookups checkinStartCheckinService.js runs for a fresh "Start Check-in".
 */
const resolveWithoutCheckinFeature = ({
  docket,
  finalCounty,
  finalCaseType,
  finalAgency,
  officialsByCase,
  attorneyByCase,
  petitionerAttorneyByCase,
  peopleByCase,
  countyIdByDescription,
  caseTypeIdByCodePair,
}) => {
  const respondentAttorney = formatPartyName(attorneyByCase.get(docket.caseId));
  const caseOfficial = pickCaseOfficial(officialsByCase.get(docket.caseId), finalCaseType, finalAgency);
  const { name: petitionerAttorney, petOrRep } = pickPetitionerOrRepresentative(
    petitionerAttorneyByCase.get(docket.caseId) || null,
    peopleByCase.get(docket.caseId) || [],
  );

  return {
    petitionerAttorney,
    petOrRep,
    respondentAttorney,
    caseOfficial,
    attendanceStatus: "0",
    circuitId: countyIdByDescription.get(finalCounty) ?? null,
    casetypeId: caseTypeIdByCodePair.get(`${finalCaseType}|${finalAgency}`) ?? null,
  };
};

export const runActiveSnapshotJob = async () => {
  const yesterday = yesterdayDateOnly();

  const placeholderRows = await PastCalendarSnapshot.findAll({
    where: { hearingDate: yesterday, activePastCalendar: "0" },
    attributes: ["id", "docketCaseId"],
    raw: true,
  });

  if (!placeholderRows.length) {
    // Either every one of yesterday's dockets is already Active (a prior run completed
    // them all - normal on a backup re-run) or Job 1 never ran for yesterday at all
    // (the known weakness above) - this log line is the only signal for either case
    // right now, so it's a warn rather than info to make the "Job 1 may have failed"
    // possibility visible without a dedicated alert.
    logger.warn(`[PastCalendarActiveSnapshot] No Inactive placeholder rows found for ${yesterday} - nothing to complete (either already done, or Job 1 never ran for this date).`);
    return { hearingDate: yesterday, scanned: 0, completed: 0, alreadyProcessed: 0, missingDocket: 0 };
  }

  const caseIds = placeholderRows.map((row) => row.docketCaseId);

  const [checkinRows, docketRows] = await Promise.all([
    CheckinCalendarTodayDate.findAll({
      where: { docketCaseId: { [Op.in]: caseIds }, hearingDate: yesterday },
      raw: true,
    }),
    Docket.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: [
        "caseId", "caseName", "refAgency", "caseType", "county", "hearingSite",
        "hearingTime", "status", "agencyRefNumber", "judge", "judgeAssistant",
      ],
      raw: true,
    }),
  ]);

  const checkinByCaseId = new Map(checkinRows.map((row) => [row.docketCaseId, row]));
  const docketByCaseId = new Map(docketRows.map((row) => [row.caseId, row]));

  // Batch lookups for the "checkin feature not used" branch - same shape as
  // checkinStartCheckinService.js's "Start Check-in" batch fetch, run here for whichever
  // of yesterday's cases turn out not to have used check-in.
  const uniqueCounties = [
    ...new Set(docketRows.map((row) => row.county).concat(checkinRows.map((row) => row.county)).filter(Boolean)),
  ];
  const uniqueCaseCodes = [
    ...new Set(docketRows.map((row) => row.caseType).concat(checkinRows.map((row) => row.caseType)).filter(Boolean)),
  ];
  const uniqueAgencyCodes = [
    ...new Set(docketRows.map((row) => row.refAgency).concat(checkinRows.map((row) => row.agency)).filter(Boolean)),
  ];

  const [
    countyRows,
    casetypeRows,
    activeJudges,
    officialRows,
    attorneyRows,
    petitionerAttorneyRows,
    peopleRows,
    attendanceTodayRows,
  ] = await Promise.all([
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
      attributes: ["userId", "firstName", "lastName"],
      raw: true,
    }),
    // Ordered most-recently-created first, matching checkinStartCheckinService.js's
    // own createdDate DESC ordering for the same "most recent caseworker of the
    // matching type wins" rule pickCaseOfficial relies on.
    AgencyCaseworkerByCase.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "lastName", "firstName", "typeOfContact"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    AttorneyByCase.findAll({
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: "Respondent Attorney" },
      attributes: ["caseId", "lastName", "firstName"],
      raw: true,
    }),
    // Petitioner Attorney (attorneybycase) - takes priority over
    // Representative (peopledetails) below, mirroring
    // checkinStartCheckinService.js's same fix. Ordered most-recently-created
    // first so a case with more than one Petitioner Attorney keeps the
    // latest one, not the first one ever added.
    AttorneyByCase.findAll({
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: "Petitioner Attorney" },
      attributes: ["caseId", "lastName", "firstName", "createdDate"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    // Ordered most-recently-created first, same reason as
    // petitionerAttorneyRows above. Petitioner is intentionally not fetched
    // here - pickPetitionerOrRepresentative only falls back to
    // Representative, never to a plain Petitioner.
    PeopleDetails.findAll({
      where: { caseId: { [Op.in]: caseIds }, typeOfContact: "Representative" },
      attributes: ["caseId", "lastName", "firstName", "typeOfContact"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    AttendanceStatusTodayDate.findAll({
      where: { docketCaseId: { [Op.in]: caseIds }, hearingDate: yesterday },
      attributes: ["docketCaseId", "partyName", "attendanceStatus"],
      raw: true,
    }),
  ]);

  const countyIdByDescription = new Map(countyRows.map((row) => [row.countyDescription, row.countyId]));
  const caseTypeIdByCodePair = new Map(
    casetypeRows.map((row) => [`${row.caseCode}|${row.agencyCode}`, row.caseTypeId]),
  );
  const judgeIdByConcat = new Map(activeJudges.map((judge) => [formatStaffConcat(judge), judge.userId]));
  const activeJudgeIdSet = new Set(activeJudges.map((judge) => judge.userId));

  const officialsByCase = new Map();
  officialRows.forEach((row) => {
    if (!officialsByCase.has(row.caseId)) officialsByCase.set(row.caseId, []);
    officialsByCase.get(row.caseId).push(row);
  });
  const attorneyByCase = new Map(attorneyRows.map((row) => [row.caseId, row]));
  // First hit per case = most recent createdDate, thanks to the DESC order
  // above - keeps the latest-added Petitioner Attorney when a case has
  // several.
  const petitionerAttorneyByCase = new Map();
  petitionerAttorneyRows.forEach((row) => {
    if (!petitionerAttorneyByCase.has(row.caseId)) petitionerAttorneyByCase.set(row.caseId, row);
  });
  const peopleByCase = new Map();
  peopleRows.forEach((row) => {
    if (!peopleByCase.has(row.caseId)) peopleByCase.set(row.caseId, []);
    peopleByCase.get(row.caseId).push(row);
  });
  const attendanceStatusByCaseAndParty = new Map(
    attendanceTodayRows.map((row) => [`${row.docketCaseId}|${row.partyName}`, row.attendanceStatus]),
  );

  let completed = 0;
  let alreadyProcessed = 0;
  let missingDocket = 0;

  for (const placeholder of placeholderRows) {
    const caseId = placeholder.docketCaseId;
    const docket = docketByCaseId.get(caseId);
    if (!docket) {
      // Docket row is gone (shouldn't normally happen - dockets are closed, not
      // deleted) - leave the placeholder Inactive rather than finalizing an empty
      // record; a backup re-run will pick it up again if the docket reappears.
      missingDocket += 1;
      logger.warn(`[PastCalendarActiveSnapshot] docket_caseid=${caseId} has no matching docket row - leaving placeholder Inactive`, { hearingDate: yesterday });
      continue;
    }

    const checkin = checkinByCaseId.get(caseId) || null;

    const finalCaseName = coalesce(checkin?.caseName, docket.caseName);
    const finalHearingSite = coalesce(checkin?.hearingSite, docket.hearingSite);
    const finalHearingTime = coalesce(checkin?.hearingTime, docket.hearingTime);
    const finalCaseType = coalesce(checkin?.caseType, docket.caseType);
    const finalCounty = coalesce(checkin?.county, docket.county);
    const finalAgency = coalesce(checkin?.agency, docket.refAgency);
    const finalAgencyReferenceNumber = coalesce(checkin?.agencyReferenceNumber, docket.agencyRefNumber);
    const finalCma = coalesce(checkin?.cma, docket.judgeAssistant);
    const finalJudgeName = coalesce(checkin?.judgeName, docket.judge);
    const finalJudgeId = checkin?.judgeId || judgeIdByConcat.get((docket.judge || "").trim()) || null;
    const finalNotes = checkin?.notes ?? null; // no docket-level fallback - notes only ever come from check-in

    const isCheckinFeature = Boolean(checkin) && Boolean(checkin.judgeId) && activeJudgeIdSet.has(checkin.judgeId);

    const branchFields = isCheckinFeature
      ? {
          petitionerAttorney: checkin.petitionerAttorney,
          petOrRep: checkin.petOrRep,
          respondentAttorney: checkin.respondentAttorney,
          caseOfficial: checkin.caseOfficial,
          attendanceStatus: checkin.attendanceStatus ?? "0",
          circuitId: checkin.circuitId,
          casetypeId: checkin.caseTypeId,
        }
      : resolveWithoutCheckinFeature({
          docket,
          finalCounty,
          finalCaseType,
          finalAgency,
          officialsByCase,
          attorneyByCase,
          petitionerAttorneyByCase,
          peopleByCase,
          countyIdByDescription,
          caseTypeIdByCodePair,
        });

    const finalData = {
      caseName: finalCaseName,
      judgeId: finalJudgeId,
      judgeName: finalJudgeName,
      cma: finalCma,
      county: finalCounty,
      hearingSite: finalHearingSite,
      hearingTime: finalHearingTime,
      agency: finalAgency,
      agencyReferenceNumber: finalAgencyReferenceNumber,
      // Source of truth, straight from the master docket table - never from check-in.
      caseType: finalCaseType,
      docketStatus: docket.status,
      notes: finalNotes,
      ...branchFields,
    };

    const [affectedCount] = await PastCalendarSnapshot.update(
      {
        ...finalData,
        activePastCalendar: "1",
        modifiedDate: new Date(),
        modifiedBy: SYSTEM_CREATED_BY,
      },
      {
        where: {
          docketCaseId: caseId,
          hearingDate: yesterday,
          activePastCalendar: "0",
          judgeName: null,
        },
      },
    );

    if (affectedCount === 0) {
      // Another run already finalized (or is mid-finalizing) this row - skip the
      // attendance-history copy too, since that run either already did it or will.
      alreadyProcessed += 1;
      continue;
    }

    completed += 1;

    await Promise.all(
      ATTENDANCE_HISTORY_PARTY_TYPES.map(async ({ partyType, nameField }) => {
        const partyName = finalData[nameField];
        const attendanceStatus = partyName
          ? attendanceStatusByCaseAndParty.get(`${caseId}|${partyName}`) ?? "0"
          : "0";

        try {
          await PastCalendarAttendanceHistory.create({
            docketCaseId: caseId,
            hearingDate: yesterday,
            partyType,
            partyName,
            attendanceStatus,
            createdDate: new Date(),
            createdBy: SYSTEM_CREATED_BY,
          });
        } catch (error) {
          // SequelizeUniqueConstraintError - a concurrent run already wrote this
          // party-type's history row for this case/date; idempotent no-op.
          if (error?.name !== "SequelizeUniqueConstraintError") throw error;
        }
      }),
    );
  }

  const summary = {
    hearingDate: yesterday,
    scanned: placeholderRows.length,
    completed,
    alreadyProcessed,
    missingDocket,
  };
  logger.info(
    `[PastCalendarActiveSnapshot] ${yesterday}: scanned=${summary.scanned} completed=${completed} ` +
      `alreadyProcessed=${alreadyProcessed} missingDocket=${missingDocket}`,
  );
  return summary;
};
