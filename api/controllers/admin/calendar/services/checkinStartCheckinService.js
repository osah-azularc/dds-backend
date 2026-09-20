// "Start Check-in" for a judge - upserts today's dockets for that judge into
// checkin_calendar_today_date with start_checkin = 1. Converted from PHP
// OsahCheckInCalenderController::saveStartCheckinCalendarAction /
// OsahCheckinCalendarModel::saveStartCheckinCalendar.
//
// Legacy flow, per docket returned by "today's dockets for this judge":
//   1. Look up case official (agencycaseworkerbycase), respondent attorney
//      (attorneybycase), and representative/petitioner (peopledetails).
//   2. Upsert into checkin_calendar_today_date, keyed by docket_caseid +
//      today's date - insert (start_checkin = 1, hearing_time captured) if
//      no row exists yet, otherwise update (hearing_time is intentionally
//      left alone once set - see checkinCalendarHelper.js's
//      updateDocketDataInCheckinCalendar for the same frozen-hearing-time
//      rule applied on later docket edits).
//   3. On first insert only, write a history audit entry.
// Then, once all dockets are processed, mark the judge as having started
// check-in today in start_checkin_county_status (insert-only - PHP's own
// update branch for this table is dead code, never executed).
import { Op, Sequelize } from "sequelize";
import { mysqlSequelize } from "../../../../../connections/seqDB.js";
import Docket from "../../../../models/Docket.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import StartCheckinCountyStatus from "../../../../models/StartCheckinCountyStatus.js";
import County from "../../../../models/County.js";
import Casetypes from "../../../../models/Casetypes.js";
import AgencyCaseworkerByCase from "../../../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../../../models/AttorneyByCase.js";
import PeopleDetails from "../../../../models/PeopleDetails.js";
import { insertDocketHistory } from "../../../../helpers/osahForm1Helper.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import {
  todayDateOnly,
  buildNotClosedCondition,
  resolveStaffConcat,
  formatPartyName as formatName,
  pickCaseOfficial,
  pickPetitionerOrRepresentative,
} from "./checkinSharedHelpers.js";
import { getFrozenDocketCaseIds } from "./checkinGuard.js";

export const saveStartCheckinCalendar = async ({ judgeUserId, modifiedBy }) => {
  if (!judgeUserId) {
    throw new CalendarServiceError(400, "judge_userid is required");
  }

  const judgeConcat = await resolveStaffConcat(judgeUserId);
  if (judgeConcat === null) {
    throw new CalendarServiceError(404, "Judge not found");
  }

  const today = todayDateOnly();

  // hearingDate matched by exact equality against today's date-only literal,
  // same as getListOfTodaysCalendars' own d.hearingdate = '$currentDate'
  // (both come from the same legacy model class's $this->currentDate
  // convention). Compared via Sequelize.where(fn('DATE', col(...)), today)
  // rather than a plain `{ hearingDate: today }` - Docket.hearingDate is
  // typed DataTypes.DATE (not DATEONLY), so a plain attribute-keyed
  // comparison runs the RHS through Sequelize's own DATE-type coercion,
  // which silently shifts a bare 'YYYY-MM-DD' string by several hours
  // before it reaches MySQL, matching nothing (see the same note in
  // checkinCalendarListService.js, where this was actually caught).
  let docketRows = await Docket.findAll({
    where: {
      [Op.and]: [
        { judge: judgeConcat },
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("hearingdate")),
          today,
        ),
        buildNotClosedCondition(),
      ],
    },
    attributes: [
      "caseId",
      "caseName",
      "refAgency",
      "caseType",
      "county",
      "hearingSite",
      "hearingTime",
      "status",
      "agencyRefNumber",
      "judgeAssistant",
    ],
    raw: true,
  });

  if (!docketRows.length) {
    return { checkedInCount: 0, insertedCount: 0, updatedCount: 0 };
  }

  // Excludes any docket whose today's hearing has already been finalized into
  // past_calendar_snapshot (see checkinGuard.js) - in practice this should never match
  // anything for "today", but it's cheap insurance against a clock skew or a re-heard
  // case reusing today's date without a fresh checkin row.
  const frozenCaseIds = await getFrozenDocketCaseIds({
    docketCaseIds: docketRows.map((d) => d.caseId),
    hearingDate: today,
  });
  docketRows = docketRows.filter((d) => !frozenCaseIds.has(d.caseId));
  if (!docketRows.length) {
    return { checkedInCount: 0, insertedCount: 0, updatedCount: 0 };
  }

  const caseIds = docketRows.map((d) => d.caseId);
  const uniqueCounties = [
    ...new Set(docketRows.map((d) => d.county).filter(Boolean)),
  ];
  const uniqueCaseCodes = [
    ...new Set(docketRows.map((d) => d.caseType).filter(Boolean)),
  ];
  const uniqueAgencyCodes = [
    ...new Set(docketRows.map((d) => d.refAgency).filter(Boolean)),
  ];

  const [
    countyRows,
    casetypeRows,
    officialRows,
    attorneyRows,
    petitionerAttorneyRows,
    peopleRows,
    existingCheckinRows,
  ] = await Promise.all([
    County.findAll({
      where: { countyDescription: { [Op.in]: uniqueCounties } },
      attributes: ["countyId", "countyDescription"],
      raw: true,
    }),
    Casetypes.findAll({
      where: {
        caseCode: { [Op.in]: uniqueCaseCodes },
        agencyCode: { [Op.in]: uniqueAgencyCodes },
      },
      attributes: ["caseTypeId", "caseCode", "agencyCode"],
      raw: true,
    }),
    AgencyCaseworkerByCase.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "lastName", "firstName", "typeOfContact"],
      // Legacy's getCaseOfficialName() is ORDER BY created_date DESC LIMIT 1
      // - the most recently added caseworker of the matching type wins
      // (e.g. after a reassignment), not the first one ever added.
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    AttorneyByCase.findAll({
      where: {
        caseId: { [Op.in]: caseIds },
        typeOfContact: "Respondent Attorney",
      },
      attributes: ["caseId", "lastName", "firstName"],
      raw: true,
    }),
    // Petitioner Attorney (attorneybycase) - takes priority over
    // Representative (peopledetails) below per AC #12 of Story
    // #1 / AC #9 of Story #7. Ordered most-recently-created first so a case
    // with more than one Petitioner Attorney keeps the latest one (e.g.
    // after a reassignment), not the first one ever added - see
    // petitionerAttorneyByCase below, and matches officialRows' own
    // createdDate DESC ordering above for the same most-recent-wins rule.
    AttorneyByCase.findAll({
      where: {
        caseId: { [Op.in]: caseIds },
        typeOfContact: "Petitioner Attorney",
      },
      attributes: ["caseId", "lastName", "firstName", "createdDate"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    // Ordered most-recently-created first, same reason as
    // petitionerAttorneyRows above - a case with more than one Representative
    // record should surface the latest one. Petitioner is intentionally not
    // fetched here - pickPetitionerOrRepresentative only falls back to
    // Representative, never to a plain Petitioner.
    PeopleDetails.findAll({
      where: {
        caseId: { [Op.in]: caseIds },
        typeOfContact: "Representative",
      },
      attributes: ["caseId", "lastName", "firstName", "typeOfContact"],
      order: [["createdDate", "DESC"]],
      raw: true,
    }),
    CheckinCalendarTodayDate.findAll({
      where: { docketCaseId: { [Op.in]: caseIds }, hearingDate: today },
      attributes: ["id", "docketCaseId", "caseOfficial"],
      raw: true,
    }),
  ]);

  const countyIdByDescription = new Map(
    countyRows.map((c) => [c.countyDescription, c.countyId]),
  );
  const caseTypeIdByCodePair = new Map(
    casetypeRows.map((c) => [`${c.caseCode}|${c.agencyCode}`, c.caseTypeId]),
  );

  const officialsByCase = new Map();
  officialRows.forEach((o) => {
    if (!officialsByCase.has(o.caseId)) officialsByCase.set(o.caseId, []);
    officialsByCase.get(o.caseId).push(o);
  });
  const attorneyByCase = new Map(attorneyRows.map((a) => [a.caseId, a]));
  // First hit per case = most recent createdDate, thanks to the DESC order
  // above - keeps the latest-added Petitioner Attorney when a case has
  // several.
  const petitionerAttorneyByCase = new Map();
  petitionerAttorneyRows.forEach((a) => {
    if (!petitionerAttorneyByCase.has(a.caseId))
      petitionerAttorneyByCase.set(a.caseId, a);
  });
  const peopleByCase = new Map();
  peopleRows.forEach((p) => {
    if (!peopleByCase.has(p.caseId)) peopleByCase.set(p.caseId, []);
    peopleByCase.get(p.caseId).push(p);
  });
  const existingCheckinByCase = new Map(
    existingCheckinRows.map((c) => [c.docketCaseId, c]),
  );

  const transaction = await mysqlSequelize.transaction();
  let insertedCount = 0;
  let updatedCount = 0;

  try {
    for (const docket of docketRows) {
      const respondentAttorney = formatName(attorneyByCase.get(docket.caseId));
      const caseOfficial = pickCaseOfficial(
        officialsByCase.get(docket.caseId),
        docket.caseType,
        docket.refAgency,
      );
      const existingRow = existingCheckinByCase.get(docket.caseId);
      const { name: petitionerAttorney, petOrRep } =
        pickPetitionerOrRepresentative(
          petitionerAttorneyByCase.get(docket.caseId) || null,
          peopleByCase.get(docket.caseId) || [],
        );

      const sharedFields = {
        caseName: docket.caseName,
        caseTypeId:
          caseTypeIdByCodePair.get(`${docket.caseType}|${docket.refAgency}`) ??
          null,
        circuitId: countyIdByDescription.get(docket.county) ?? null,
        agency: docket.refAgency,
        judgeName: judgeConcat,
        county: docket.county,
        hearingSite: docket.hearingSite,
        judgeId: judgeUserId,
        caseType: docket.caseType,
        petitionerAttorney,
        petOrRep,
        respondentAttorney,
        caseOfficial,
        agencyReferenceNumber: docket.agencyRefNumber,
        cma: docket.judgeAssistant,
        startCheckin: "1",
        docketStatus: docket.status,
      };

      if (existingRow) {
        await CheckinCalendarTodayDate.update(
          { ...sharedFields, modifiedBy, modifiedDate: new Date() },
          { where: { id: existingRow.id }, transaction },
        );
        updatedCount += 1;
      } else {
        await CheckinCalendarTodayDate.create(
          {
            ...sharedFields,
            docketCaseId: docket.caseId,
            hearingDate: today,
            // Frozen at check-in time - never updated afterwards (see
            // updateDocketDataInCheckinCalendar's hearing_time comment).
            hearingTime: docket.hearingTime,
            createdBy: modifiedBy,
            createdDate: new Date(),
          },
          { transaction },
        );
        insertedCount += 1;

        await insertDocketHistory(
          String(docket.caseId),
          '<p class="history-title">Check-in started for this case.</p>',
          String(modifiedBy ?? 0),
        );
      }
    }

    // Insert-only, matching PHP: the update branch for this table is dead
    // code there too (commented out, never executed).
    const alreadyStarted = await StartCheckinCountyStatus.findOne({
      where: {
        judgeId: judgeUserId,
        startCheckinDate: today,
        startCheckinFlag: "1",
      },
      transaction,
    });
    if (!alreadyStarted) {
      await StartCheckinCountyStatus.create(
        {
          judgeId: judgeUserId,
          countyCircuitId: 0,
          casetypeId: 0,
          startCheckinDate: today,
          startCheckinFlag: "1",
          createdBy: modifiedBy,
          createdDate: new Date(),
        },
        { transaction },
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { checkedInCount: docketRows.length, insertedCount, updatedCount };
};
