import Docket from '../../models/Docket.js';
import County from '../../models/County.js';
import { getHearingInfoByCasetypeAndCounty } from '../osahForm1Helper.js';
import { recordDocketHistory } from './osahForm1DocketHistoryHelper.js';
import { updateStartCheckinCalendarOnDocketUpdate } from '../checkinCalendarHelper.js';
import { buildDocketNumber } from '../../services/osahForm1Service.js';
import { logger } from '../../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-08-22
  Description : Mirrors PHP OsahformController::updateCountyHearingInfo()
                (module/Osahform/src/Osahform/Controller/OsahformController.php:14131-14233),
                called from editpartydetailsAction() ONLY for the
                'agencycaseworkerbycase' party table, and only when the party
                being added/edited is typeofcontact === 'Officer' (Gate 1 — the
                caller checks this before invoking reassignHearingInfoForOfficerParty).

                When an Officer party's City is one of Fulton county's 5
                municipal-court sub-locations, DDS/DPS cases route their
                hearing to that sub-county's own judge/CMA/location/date
                calendar instead of the case's normal county calendar. This
                re-resolves that assignment and pushes it onto the docket,
                which in turn (same as any other docket field change) cascades
                into the day's checkin_calendar_today_date sync via
                checkinCalendarHelper.js.

                Non-fatal: any failure here must never block the party
                save that already committed by the time this runs — matches
                the same non-fatal contract checkinCalendarHelper.js uses.
*/

// Gate 3 — Fulton's 5 municipal-court sub-locations, each mapped to its own
// `county` table row (Countydescription). Matched case-insensitively — the
// legacy PHP used ucfirst(strtolower($city)) against a title-cased list,
// which silently never matched the two-word cities ("Sandy Springs",
// "Johns Creek", since ucfirst() only capitalizes the very first letter of
// the whole string). Case-insensitive full-string matching here so all 5
// cities actually work, not just the 3 single-word ones.
const FULTON_CITY_TO_COUNTY_CODE = {
  roswell: 'FUL_Roswell',
  alpharetta: 'FUL_Alpha',
  'sandy springs': 'FUL_SSprings',
  'johns creek': 'FUL_JohnsCreek',
  milton: 'FUL_Milton',
};

// Gate 2 — legacy hardcoded casetype IDs used ONLY for this Fulton
// sub-county calendar lookup (not the case's own casetype). Both are the
// 'ALS' (Administrative License Suspension) casetype row for the
// respective agency — confirmed against the `casetypes` table:
// 605 = DPS/ALS, 612 = DDS/ALS.
const REASSIGNMENT_CASETYPE_ID = { DDS: 612, DPS: 605 };

const DOCKET_SNAPSHOT_ATTRIBUTES = [
  'caseId', 'refAgency', 'caseType', 'caseFileType', 'county', 'status',
  'dateRequested', 'dateReceivedByOSAH', 'hearingMode', 'hearingSite',
  'hearingDate', 'hearingTime', 'hearingTimeId', 'judge', 'judgeAssistant',
  'staffAttorney', 'docketClerk', 'caseName', 'tempPermits', 'telvOFive',
  'agencyRefNumber',
];

// mirrors PHP: $mmddyyyy = getHearingInfoByCasetypeAndCounty's display-formatted
// 'MM-DD-YYYY' hearing_date -> the 'YYYY-MM-DD' string Docket.hearingDate (a DATE
// column) needs.
function toIsoDate(mmddyyyy) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(mmddyyyy || '');
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

// Mirrors PHP: status = Pending if no hearing_date resolved, else 'Hearing
// Scheduled' if old status was Pending, else 'Rescheduled'.
function resolveStatus(hearingInfo, previousStatus) {
  if (!hearingInfo.hearing_date) return 'Pending';
  return previousStatus === 'Pending' ? 'Hearing Scheduled' : 'Rescheduled';
}

/**
 * @description Re-resolves and applies the Fulton sub-county hearing
 *              assignment (judge/CMA/time/location/date/status) for a docket
 *              whose Officer party was just added/edited with a Fulton
 *              municipal-court City, then runs the same checkin_calendar_today_date
 *              sync any other docket update would trigger.
 *              Mirrors PHP updateCountyHearingInfo().
 *
 * @param {string|number} caseId    - Docket case ID (editpartydetails.Docket_caseid/caseid)
 * @param {string}        city      - Officer party's City field
 * @param {Object}        opts
 * @param {string}        opts.modifiedBy - Username for history/audit columns
 * @param {number}        opts.userId     - Integer user ID for checkin table modified_by column
 */
export async function reassignHearingInfoForOfficerParty(caseId, city, { modifiedBy, userId } = {}) {
  logger.info('[officerHearingReassignmentHelper] reassignHearingInfoForOfficerParty ══ ENTRY (Gate 1 already passed by caller: party is Officer)', { caseId, city });
  try {
    const existingDocket = await Docket.findByPk(caseId, { attributes: DOCKET_SNAPSHOT_ATTRIBUTES });
    if (!existingDocket) {
      logger.info('[officerHearingReassignmentHelper] docket not found — aborting', { caseId });
      return;
    }

    // Gate 2 — agency must be DDS or DPS
    const refAgency = existingDocket.refAgency;
    const gate2Passed = refAgency === 'DDS' || refAgency === 'DPS';
    logger.info('[officerHearingReassignmentHelper] Gate 2 (refAgency must be DDS or DPS)', { caseId, refAgency, gate2Passed });
    if (!gate2Passed) return;

    // Gate 3 — City must be one of Fulton's 5 municipal-court sub-locations
    const normalizedCity = String(city || '').trim().toLowerCase();
    const subCountyCode = FULTON_CITY_TO_COUNTY_CODE[normalizedCity];
    logger.info('[officerHearingReassignmentHelper] Gate 3 (City must be a Fulton sub-location)', { caseId, city, normalizedCity, subCountyCode, gate3Passed: !!subCountyCode });
    if (!subCountyCode) return;

    const countyRow = await County.findOne({ where: { countyDescription: subCountyCode }, attributes: ['countyId'] });
    logger.info('[officerHearingReassignmentHelper] sub-county lookup', { caseId, subCountyCode, found: !!countyRow, countyId: countyRow?.countyId });
    if (!countyRow) {
      logger.info('[officerHearingReassignmentHelper] sub-county row missing from `county` table — aborting', { caseId, subCountyCode });
      return;
    }

    const casetypeId = REASSIGNMENT_CASETYPE_ID[refAgency];
    const hearingInfo = await getHearingInfoByCasetypeAndCounty(casetypeId, countyRow.countyId);
    logger.info('[officerHearingReassignmentHelper] resolved new hearing assignment', { caseId, casetypeId, countyId: countyRow.countyId, hearingInfo });

    const updateFields = {
      county: subCountyCode,
      judge: hearingInfo.judge_name || null,
      judgeAssistant: hearingInfo.cma_name || null,
      hearingTime: hearingInfo.hearingTimeStored || null,
      hearingTimeId: hearingInfo.time_id ? Number(hearingInfo.time_id) : null,
      hearingSite: hearingInfo.caseLocation || null,
      hearingDate: toIsoDate(hearingInfo.hearing_date),
      status: resolveStatus(hearingInfo, existingDocket.status),
    };
    updateFields.docketNumber = buildDocketNumber({
      refAgency: existingDocket.refAgency,
      caseType: existingDocket.caseType,
      caseId,
      countyId: countyRow.countyId,
      judge: updateFields.judge || existingDocket.judge,
    });
    logger.info('[officerHearingReassignmentHelper] built docket reassignment fields', { caseId, updateFields });

    await Docket.update(updateFields, { where: { caseId } });
    logger.info('[officerHearingReassignmentHelper] docket UPDATED with new hearing assignment', { caseId });

    await recordDocketHistory(caseId, existingDocket, updateFields, { isReopenSave: false, reopenHearingInfo: '', modifiedBy });
    logger.info('[officerHearingReassignmentHelper] docket history recorded', { caseId });

    logger.info('[officerHearingReassignmentHelper] handing off to checkin_calendar_today_date sync (Gate 4 + downstream checks live there)', { caseId });
    await updateStartCheckinCalendarOnDocketUpdate(caseId, existingDocket, updateFields, { modifiedBy, userId });

    logger.info('[officerHearingReassignmentHelper] reassignHearingInfoForOfficerParty ══ EXIT (success)', { caseId });
  } catch (err) {
    // Non-fatal: the party save already committed — this cascade must never
    // surface an error to the party-save caller.
    logger.error('[officerHearingReassignmentHelper] reassignHearingInfoForOfficerParty failed for caseId', caseId, err?.message ?? err);
  }
}
