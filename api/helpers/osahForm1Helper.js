import { Op } from 'sequelize';
import { localNow } from './timeUtils.js';
import HearingDateSkip from '../models/admin/hearingDateSkipModel.js';
import Cuttoffdate from '../models/cuttoffdateModel.js';
import V2_5_CalendarCasetype from '../models/admin/v2_5_calendarCasetypeModel.js';
import V2_5_CountyCircuitMap from '../models/admin/v2_5_countyCircuitMapModel.js';
import Casetypes from '../models/Casetypes.js';
import History from '../models/History.js';
import {
  V2_5_Calendar_Hearing_Info,
  V2_5_Calendar,
  CasteTypeGroups,
  HearingTime,
  CourtLocations,
  JudgeAssistantClerk,
  Docket,
} from '../models/index.js';
export { checkHearingDateManual } from './osahForm1HearingCapacityHelper.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-03-13
  Description : Data-access helpers for the OSAH Form 1 (New Docket) module.
                All DB access uses Sequelize models — zero raw SQL strings.
                Dropdown data (agencies, casetypes, court locations, hearing times,
                counties, staff, hearing modes) is served by the shared
                POST /reports/getDataDynamic endpoint; no duplicate logic here.
*/

// ─────────────────────────────────────────────────────────────────────────────
// Associations are defined centrally in models/index.js — not repeated here.
/**
 * @description Returns the next upcoming hearing slot for the given case type
 *              and county. Uses three sequential model queries to avoid raw SQL:
 *              1. county → circuit IDs   (v2_5_county_circuit_map)
 *              2. circuits → calendar IDs filtered by case type (v2_5_calendar + v2_5_calendar_casetype)
 *              3. calendar IDs → earliest upcoming hearing info with associations
 *              Replicates legacy CalendarModel::hearingInfo().
 * @param {number} casetypeId - Numeric case-type ID
 * @param {number} countyId   - Numeric county ID
 * @returns {Promise<{ judge: string|null, judgeAssistant: string|null,
 *           caseLocation: string|null, hearingDate: string|null, hearingTime: string|null,
 *           hearingTimeStored: string|null }>}
 *           Always returns an object. Hearing fields are `null` when no upcoming slot is found.
 */
export async function getHearingInfoByCasetypeAndCounty(casetypeId, countyId) {
  const ctId = Number.parseInt(casetypeId, 10);
  const cnId = Number.parseInt(countyId, 10);
  const casetypeRecord = await Casetypes.findOne({
    attributes: ['caseTypeId', 'caseCode', 'agencyId', 'agencyCode'],
    where: { caseTypeId: ctId },
  });
  const emptyResult = {
    no_of_cases_docketed: '0',
    no_of_cases: null,
    calendar_id: null,
    judge_id: null,
    judge: null,
    judge_name: null,
    d_judge: null,
    d_cma: null,
    cma_id: null,
    cma: null,
    cma_name: null,
    time_id: null,
    time: null,
    court_location_id: null,
    court_location: null,
    circuit_id: null,
    circuit: null,
    casetype_group_id: null,
    casetype_group: null,
    casetype_id: casetypeRecord?.caseTypeId ? String(casetypeRecord.caseTypeId) : String(casetypeId),
    casetype: casetypeRecord?.caseCode ?? null,
    agency: casetypeRecord?.agencyId ?? null,
    agency_id: casetypeRecord?.agencyCode ?? null,
    hearing_date: null,
    cutoff_date: null,
    judgeAssistant: null,
    caseLocation: null,
    hearingDate: null,
    hearingTime: null,
    hearingTimeStored: null,
  };

  // Step 1 — check hearingdateskip (mirrors PHP $hearingdateskipData check)
  const skipRecord = await HearingDateSkip.findOne({ where: { caseTypeId: ctId } });
  const skipHearing = skipRecord !== null;

  // Step 2 — build hearing-date WHERE clause for non-skip types
  // Mirrors PHP: SELECT cutoff_days_diffrence FROM cuttoffdate WHERE casetypeid=?
  const hearingDateWhere = {};
  if (!skipHearing) {
    const cutoffRow = await Cuttoffdate.findOne({
      attributes: ['cutoffDaysDifference'],
      where: { casetypeId: ctId },
    });
    if (cutoffRow) {
      // Threshold = today + cutoff_days_diffrence
      const days = cutoffRow.cutoffDaysDifference || 0;
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + days);
      hearingDateWhere.hearingDate = { [Op.gt]: threshold.toISOString().slice(0, 10) };
    } else {
      // No cutoff record — fall back to cutoff_date > TODAY (mirrors raw SQL: cutoff_date > CURDATE())
      hearingDateWhere.cutoffDate = { [Op.gt]: new Date().toISOString().slice(0, 10) };
    }
  }

  // Step 3a — county → circuit IDs  (v2_5_county_circuit_map)
  const circuitMaps = await V2_5_CountyCircuitMap.findAll({
    attributes: ['circuitId'],
    where: { countyId: cnId },
  });
  const circuitIds = circuitMaps.map(r => r.circuitId).filter(Boolean);
  if (!circuitIds.length) return emptyResult;

  // Step 3b — casetype → calendar IDs  (v2_5_calendar_casetype)
  const calendarCasetypes = await V2_5_CalendarCasetype.findAll({
    attributes: ['calendarId'],
    where: { caseTypeId: ctId },
  });
  const allCalendarIds = calendarCasetypes.map(r => r.calendarId).filter(Boolean);
  if (!allCalendarIds.length) return emptyResult;

  // Step 3c — intersect: calendars that match BOTH the casetype AND the county's circuits
  const validCalendars = await V2_5_Calendar.findAll({
    attributes: ['id'],
    where: { id: { [Op.in]: allCalendarIds }, circuitId: { [Op.in]: circuitIds } },
  });
  const validCalendarIds = validCalendars.map(r => r.id);
  if (!validCalendarIds.length) return emptyResult;

  // Step 4 — fetch hearing slots with all required associations
  // ORDER: ASC for normal types, DESC for skip-hearing types (matches PHP $order logic)
  const orderDir = skipHearing ? 'DESC' : 'ASC';
  const hearingSlots = await V2_5_Calendar_Hearing_Info.findAll({
    where: { calendarId: { [Op.in]: validCalendarIds }, ...hearingDateWhere },
    include: [
      { model: JudgeAssistantClerk, as: 'judge',       attributes: ['firstName', 'lastName'] },
      { model: JudgeAssistantClerk, as: 'cma',         attributes: ['firstName', 'lastName'] },
      { model: HearingTime,         as: 'hearingTime',  attributes: ['hearingTime', 'hearingTimeStored'] },
      { model: CourtLocations,      as: 'courtLocation', attributes: ['locationName'] },
      {
        model: V2_5_Calendar,
        as: 'calendar',
        attributes: ['id', 'circuitId', 'caseTypeGroupId'],
        include: [{ model: CasteTypeGroups, as: 'casetypegroup', attributes: ['casetypegroup'] }],
      },
    ],
    order: [
      ['hearingDate', orderDir],
      [{ model: HearingTime, as: 'hearingTime' }, 'hearingTimeStored', 'ASC'],
    ],
  });
  if (!hearingSlots.length) return emptyResult;

  // Step 5 — find first slot below capacity
  // Replicates HAVING (no_of_cases_docketed < no_of_cases OR no_of_cases IS NULL)
  for (const slot of hearingSlots) {
    const capacity = slot.noOfCases;
    const htStored = slot.hearingTime?.hearingTimeStored ?? null;
    const locName  = slot.courtLocation?.locationName  ?? null;

    // No capacity limit → immediately available
    if (capacity === null) return buildHearingResult(slot, htStored, locName, 0, casetypeRecord);

    const docketCount = await Docket.count({
      where: { hearingDate: slot.hearingDate, hearingTime: htStored, hearingSite: locName },
    });

    if (docketCount < capacity) return buildHearingResult(slot, htStored, locName, docketCount, casetypeRecord);
  }

  return emptyResult;
}

/** @private — formats a V2_5_Calendar_Hearing_Info instance into the standard response shape. */
function buildHearingResult(slot, htStored, locName, docketCount, casetypeRecord) {
  const judge = slot.judge;
  const cma   = slot.cma;
  const calendar = slot.calendar;
  const casetypeGroup = calendar?.casetypegroup;
  // Convert 'YYYY-MM-DD' → 'MM-DD-YYYY' to match DATE_FORMAT(hearing_date,'%m-%d-%Y')
  const rawDate    = slot.hearingDate ? String(slot.hearingDate).slice(0, 10) : null;
  const hearingDate = rawDate
    ? rawDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2-$3-$1')
    : null;
  const judgeDisplay = judge ? `${judge.lastName}, ${judge.firstName}` : null;
  const judgeName = judge ? `${judge.lastName} ${judge.firstName}` : null;
  const cmaDisplay = cma ? `${cma.lastName}, ${cma.firstName}` : null;
  const cmaName = cma ? `${cma.lastName} ${cma.firstName}` : null;
  return {
    no_of_cases_docketed: String(docketCount ?? 0),
    no_of_cases: slot.noOfCases == null ? null : String(slot.noOfCases),
    calendar_id: slot.calendarId == null ? null : String(slot.calendarId),
    judge_id: slot.judgeId == null ? null : String(slot.judgeId),
    judge: judgeDisplay,
    judge_name: judgeName,
    d_judge: null,
    d_cma: null,
    cma_id: slot.cmaId == null ? null : String(slot.cmaId),
    cma: cmaDisplay,
    cma_name: cmaName,
    time_id: slot.timeId == null ? null : String(slot.timeId),
    time: htStored,
    court_location_id: slot.courtLocationId == null ? null : String(slot.courtLocationId),
    court_location: locName,
    circuit_id: calendar?.circuitId == null ? null : String(calendar.circuitId),
    circuit: null,
    casetype_group_id: calendar?.caseTypeGroupId == null ? null : String(calendar.caseTypeGroupId),
    casetype_group: casetypeGroup?.casetypegroup ?? null,
    casetype_id: casetypeRecord?.caseTypeId == null ? null : String(casetypeRecord.caseTypeId),
    casetype: casetypeRecord?.caseCode ?? null,
    agency: casetypeRecord?.agencyId ?? null,
    agency_id: casetypeRecord?.agencyCode ?? null,
    hearing_date: hearingDate,
    cutoff_date: slot.cutoffDate ?? null,
    judgeAssistant: cmaName,
    caseLocation: locName,
    hearingDate,
    hearingTime: slot.hearingTime?.hearingTime ?? null,
    hearingTimeStored: htStored, // DB column is heringtimestored (legacy typo preserved via field:)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @description Inserts a record into the `history` table using the History
 *              model — no raw SQL.
 *              Replicates legacy OsahDbFunctions::addHistory($db, $values, 'history').
 * @param {number} caseId     - Case ID
 * @param {string} message    - HTML-formatted history message
 * @param {string} modifiedBy - Username of the person making the change
 * @returns {Promise<number>} 1 on success (mirrors PHP OsahDbFunctions::addHistory return value)
 */
export async function insertDocketHistory(caseId, message, modifiedBy) {
  const now = localNow();
  await History.create({
    caseId,
    docketCaseId: caseId,
    description: message,
    modifiedBy,
    date: now.format('YYYY-MM-DD'),
    createdTime: now.format('HH:mm:ss'),
  });
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @description Checks whether the selected case type is configured to skip
 *              the hearing date assignment step.
 *              Replicates legacy searchbyvalue("hearingdateskip","Casetypeid="+id).
 * @param {number} casetypeId - Numeric case-type ID
 * @returns {Promise<boolean>} true if a skip-hearing record exists
 */
export async function checkSkipHearing(casetypeId) {
  const record = await HearingDateSkip.findOne({
    where: { caseTypeId: Number.parseInt(casetypeId, 10) },
  });
  return record !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @description Returns the casefiletype for a given agency code + case type code.
 *              Replicates legacy Osahform/get-confidential-case-type.
 * @param {string} refagency - Agency code (e.g. "OAH")
 * @param {string} casetype  - Case type code (e.g. "AP")
 * @returns {Promise<string|null>} casefiletype string or null if not found
 */
export async function getConfidentialCaseType(refagency, casetype) {
  const record = await Casetypes.findOne({
    attributes: ['caseFileType'],
    where: { agencyCode: refagency, caseCode: casetype },
  });
  return record ? record.caseFileType : null;
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * @description Fetches all hearing times from the hearingtime table, excluding
 *              timeid=0, sorted in chronological order (12:00 AM to 11:45 PM).
 *              Converts all values to strings to match legacy PHP behavior.
 * @returns {Promise<Array<{timeid: string, heringtimestored: string, hearingtime: string}>>}
 *          Array of hearing time objects sorted by time, all values stringified
 */
export async function getHearingTimeList() {
  const hearingTimes = await HearingTime.findAll({
    where: {
      timeId: { [Op.ne]: 0 },
    },
    attributes: ['timeId', 'hearingTimeStored', 'hearingTime'],
    order: [['hearingTimeStored', 'ASC']],
    raw: true,
  });

  // Convert all values to strings to match PHP behavior
  return hearingTimes.map(item => ({
    timeid: String(item.timeId),
    heringtimestored: item.hearingTimeStored ? String(item.hearingTimeStored) : '',
    hearingtime: String(item.hearingTime),
  }));
}

