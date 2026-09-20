import { Op, fn, col, where as seqWhere } from 'sequelize';
import CheckinCalendarTodayDate from '../models/CheckinCalendarTodayDate.js';
import JudgeAssistantClerk from '../models/JudgeAssistantClerk.js';
import County from '../models/County.js';
import Casetypes from '../models/Casetypes.js';
import StartCheckinCountyStatus from '../models/StartCheckinCountyStatus.js';
import PastCalendarSnapshot from '../models/PastCalendarSnapshot.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';
import { insertDocketHistory } from './osahForm1Helper.js';
import { pickCaseOfficial } from '../controllers/admin/calendar/services/checkinSharedHelpers.js';
import { logger } from "../../config/winstonLogger.js";

/*
  Created by  : Snehal Narkar
  Date        : 2026-05-27
  Description : Checkin-calendar sync helpers called after a docket general-info update.
                Mirrors PHP OsahCheckinCalendarModel methods:
                  - updateDocketDataToStartCheckinDocket   → updateDocketDataInCheckinCalendar
                  - updateStartCheckinCalendarGroupInfo    → updateCheckinCalendarGroupForJudgeChange
                  - updateDocketStatusToStartCheckinDocket → updateDocketStatusFlagInCheckinCalendar
                Entry point: updateStartCheckinCalendarOnDocketUpdate()

                resyncCaseOfficialOnPartyChange() below is a separate entry
                point, added per Story US3's requirement that the Case
                Official resolver run consistently everywhere it's computed -
                including when an agencycaseworkerbycase party (Officer/
                Investigator/Case Worker/Agency Contact) is added, edited, or
                deleted for an already-checked-in docket, not just on initial
                check-in / carry-forward. Reuses checkinSharedHelpers.js's
                pickCaseOfficial() rather than re-deriving the rule, per that
                story's "implement as one shared function" requirement.
*/

const TODAY = () => new Date().toISOString().slice(0, 10);

// ─── Label map for history messages (mirrors PHP updateStartCheckinDocketDataHistory) ──
const CHECKIN_HISTORY_LABEL = {
  county: 'County',
  agency: 'Agency',
  caseType: 'Case Type',
  hearingSite: 'Location',
  judgeName: 'Judge',
  cma: 'CMA',
  agencyReferenceNumber: 'Agency Reference',
  docketStatus: 'Docket Status',
};

// ─── Private helpers ──────────────────────────────────────────────────────────

async function lookupJudgeUserId(judgeName) {
  if (!judgeName) return 0;
  const judge = await JudgeAssistantClerk.findOne({
    attributes: ['userId'],
    where: {
      [Op.and]: [
        seqWhere(fn('CONCAT', col('LastName'), ' ', col('FirstName')), judgeName),
        { userType: 'judge', isActive: '1' },
      ],
    },
  });
  return judge?.userId ?? 0;
}

function buildCheckinUpdateHistoryMessage(changed) {
  const { latest, previous } = changed;
  let msg = '<p class="history-title">Start checkin updated information as per case details newly update.</p>';
  for (const [key, val] of Object.entries(latest)) {
    msg += `<p><span class="history-label"> ${CHECKIN_HISTORY_LABEL[key] ?? key}:</span><span class="history-data">${val}</span></p>`;
  }
  msg += '<br/><p class="history-title"><strong>Previous Entry: </strong></p>';
  for (const [key, val] of Object.entries(previous)) {
    msg += `<p><span class="history-label"> ${CHECKIN_HISTORY_LABEL[key] ?? key}:</span><span class="history-data">${val}</span></p>`;
  }
  return msg;
}

// ─── Field-update helpers for updateDocketDataInCheckinCalendar ───────────────

function trackSimpleField(newVal, existingVal, key, data, changed) {
  if (newVal === undefined || newVal === '') return;
  data[key] = newVal;
  if (newVal !== existingVal) {
    changed.latest[key] = newVal;
    changed.previous[key] = existingVal;
  }
}

async function resolveCountyData(updateFields, existing, data, changed) {
  if (!updateFields.county) return;
  const countyRow = await County.findOne({
    where: { countyDescription: updateFields.county },
    attributes: ['countyId'],
  });
  if (!countyRow) return;
  data.circuitId = countyRow.countyId;
  data.county = updateFields.county;
  if (updateFields.county !== existing.county) {
    changed.latest.county = updateFields.county;
    changed.previous.county = existing.county;
  }
}

async function applyAgencyAndCaseType(updateFields, existing, data, changed) {
  const ct = await Casetypes.findOne({
    where: { isActive: '1', caseCode: updateFields.caseType, agencyCode: updateFields.refAgency },
    attributes: ['caseTypeId'],
  });
  if (!ct) return;
  data.caseTypeId = ct.caseTypeId;
  data.agency = updateFields.refAgency;
  data.caseType = updateFields.caseType;
  if (updateFields.refAgency !== existing.agency) {
    changed.latest.agency = updateFields.refAgency;
    changed.previous.agency = existing.agency;
  }
  if (updateFields.caseType !== existing.caseType) {
    changed.latest.caseType = updateFields.caseType;
    changed.previous.caseType = existing.caseType;
  }
}

// Only refAgency changed — resolve casetype_id using the existing case_type
async function applyAgencyOnly(updateFields, existing, data, changed) {
  const ct = await Casetypes.findOne({
    where: { isActive: '1', caseCode: existing.caseType, agencyCode: updateFields.refAgency },
    attributes: ['caseTypeId'],
  });
  if (!ct) return;
  data.caseTypeId = ct.caseTypeId;
  data.agency = updateFields.refAgency;
  if (updateFields.refAgency !== existing.agency) {
    changed.latest.agency = updateFields.refAgency;
    changed.previous.agency = existing.agency;
  }
}

async function resolveCaseTypeData(updateFields, existing, data, changed) {
  if (updateFields.caseType !== undefined && updateFields.refAgency !== undefined) {
    await applyAgencyAndCaseType(updateFields, existing, data, changed);
  } else if (updateFields.refAgency !== undefined && updateFields.refAgency !== '') {
    await applyAgencyOnly(updateFields, existing, data, changed);
  }
}

async function resolveJudgeData(updateFields, existing, data, changed) {
  if (updateFields.judge === undefined || updateFields.judge === '') return;
  const judgeId = await lookupJudgeUserId(updateFields.judge);
  data.judgeName = updateFields.judge;
  data.judgeId = judgeId;
  if (updateFields.judge !== existing.judgeName) {
    changed.latest.judgeName = updateFields.judge;
    changed.previous.judgeName = existing.judgeName;
  }
}

// ─── Mirrors PHP updateDocketDataToStartCheckinDocket() ──────────────────────
// Updates checkin_calendar_today_date with the docket's new values when the
// case has already been processed through start-checkin (start_checkin = 1).
// Note: hearing_time is intentionally NOT updated per business rule (Corin Yaish).
async function updateDocketDataInCheckinCalendar(updateFields, caseId, userId) {
  const today = TODAY();
  logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar ── start (field-sync write)', { caseId, today });

  const existing = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId: caseId, hearingDate: today, startCheckin: '1' },
    attributes: ['county', 'agency', 'caseType', 'hearingSite', 'judgeName', 'docketStatus', 'agencyReferenceNumber', 'cma'],
  });
  logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: start_checkin=1 row lookup', { caseId, today, found: !!existing, existing });
  if (!existing) {
    logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: no start-checkin row for today — skipping field-sync write', { caseId });
    return;
  }

  const data = {};
  const changed = { latest: {}, previous: {} };

  await resolveCountyData(updateFields, existing, data, changed);
  await resolveCaseTypeData(updateFields, existing, data, changed);
  await resolveJudgeData(updateFields, existing, data, changed);
  // hearing_time is intentionally NOT updated — business rule: freeze hearing time after start-checkin
  trackSimpleField(updateFields.hearingSite, existing.hearingSite, 'hearingSite', data, changed);
  trackSimpleField(updateFields.status, existing.docketStatus, 'docketStatus', data, changed);
  trackSimpleField(updateFields.agencyRefNumber, existing.agencyReferenceNumber, 'agencyReferenceNumber', data, changed);
  trackSimpleField(updateFields.judgeAssistant, existing.cma, 'cma', data, changed);
  logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: resolved field set', { caseId, data, changed });

  if (Object.keys(data).length > 0) {
    data.modifiedDate = new Date();
    data.modifiedBy = userId ?? 0;
    await CheckinCalendarTodayDate.update(data, { where: { docketCaseId: caseId, hearingDate: today } });
    logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: checkin_calendar_today_date UPDATED', { caseId, today, data });
  } else {
    logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: no field changes to write', { caseId });
  }
  if (Object.keys(changed.latest).length > 0) {
    const message = buildCheckinUpdateHistoryMessage(changed);
    await insertDocketHistory(String(caseId), message, String(userId ?? 0));
    logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar: history entry recorded for changed fields', { caseId, changed });
  }
  logger.info('[checkinCalendarHelper] updateDocketDataInCheckinCalendar ── end', { caseId });
}

// ─── Mirrors PHP updateStartCheckinCalendarGroupInfo() ───────────────────────
// When a judge is reassigned, updates the start_checkin_county_status grouping:
//   - Single-case + new judge has group  → delete old group
//   - Single-case + new judge has no group → transfer old group to new judge
//   - Multi-case  + new judge has no group → insert new group for new judge
async function updateCheckinCalendarGroupForJudgeChange(oldJudgeId, isSingleCase, newJudgeId) {
  const today = TODAY();
  logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange ── start', { oldJudgeId, isSingleCase, newJudgeId, today });

  const newJudgeGroup = await StartCheckinCountyStatus.findOne({
    where: { judgeId: newJudgeId, startCheckinDate: today, startCheckinFlag: '1' },
    attributes: ['id'],
  });
  logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange: existing group lookup for new judge', { newJudgeId, today, found: !!newJudgeGroup });

  if (newJudgeGroup) {
    if (isSingleCase) {
      await StartCheckinCountyStatus.destroy({
        where: { judgeId: oldJudgeId, startCheckinDate: today, startCheckinFlag: '1' },
      });
      logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange: new judge already has a group, single-case → old judge group DELETED', { oldJudgeId, today });
    } else {
      logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange: new judge already has a group, multi-case → no action', { oldJudgeId, newJudgeId });
    }
    // Multi-case: no action needed (updated_casetype_caseid update is commented out in PHP)
  } else if (isSingleCase) {
    await StartCheckinCountyStatus.update(
      { judgeId: newJudgeId },
      { where: { judgeId: oldJudgeId, startCheckinDate: today } }
    );
    logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange: single-case, no group for new judge → old group TRANSFERRED to new judge', { oldJudgeId, newJudgeId, today });
  } else {
    await StartCheckinCountyStatus.create({
      judgeId: newJudgeId,
      casetypeId: 0,
      countyCircuitId: 0,
      startCheckinDate: today,
      startCheckinFlag: '1',
      createdBy: 0,
      createdDate: new Date(),
    });
    logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange: multi-case, no group for new judge → new group INSERTED', { newJudgeId, today });
  }
  logger.info('[checkinCalendarHelper] updateCheckinCalendarGroupForJudgeChange ── end', { oldJudgeId, newJudgeId });
}

// ─── Mirrors PHP updateDocketStatusToStartCheckinDocket() ────────────────────
// Marks docket_status_updated_today = 1 in checkin_calendar_today_date.
// If no record exists yet (status changed before start-checkin), inserts a minimal record with start_checkin = 0 so the flag is captured.
async function updateDocketStatusFlagInCheckinCalendar(caseId) {
  const today = TODAY();
  logger.info('[checkinCalendarHelper] updateDocketStatusFlagInCheckinCalendar ── start (status-flag write)', { caseId, today });

  const existing = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId: caseId, hearingDate: today },
    attributes: ['startCheckin'],
  });
  logger.info('[checkinCalendarHelper] updateDocketStatusFlagInCheckinCalendar: any row for today lookup', { caseId, today, found: !!existing, startCheckin: existing?.startCheckin });

  if (existing) {
    await CheckinCalendarTodayDate.update(
      { docketStatusUpdatedToday: '1', modifiedDate: new Date() },
      { where: { docketCaseId: caseId, hearingDate: today } }
    );
    logger.info('[checkinCalendarHelper] updateDocketStatusFlagInCheckinCalendar: row exists → docket_status_updated_today=1 UPDATED', { caseId, today });
  } else {
    // Pre-start-checkin status change: insert a minimal placeholder row
    await CheckinCalendarTodayDate.create({
      docketCaseId: caseId,
      hearingDate: today,
      startCheckin: '0',
      docketStatusUpdatedToday: '1',
      judgeId: 0,
      createdDate: new Date(),
      createdBy: 0,
    });
    logger.info('[checkinCalendarHelper] updateDocketStatusFlagInCheckinCalendar: no row yet → stub row INSERTED (start_checkin=0, docket_status_updated_today=1)', { caseId, today });
  }
  logger.info('[checkinCalendarHelper] updateDocketStatusFlagInCheckinCalendar ── end', { caseId });
}

// ─── Extracted sub-steps for updateStartCheckinCalendarOnDocketUpdate ────────

// Mirrors PHP block: if start_checkin == 1 → update docket data + handle judge group change.
async function processStartCheckinRecordUpdate(caseId, existingDocket, updateFields, userId) {
  const today = TODAY();
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate ── start (condition 2: field-sync gate)', { caseId, today });

  const startCheckinRecord = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId: caseId, hearingDate: today, startCheckin: '1' },
    attributes: ['id'],
  });
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: start_checkin=1 gate check', { caseId, today, gatePassed: !!startCheckinRecord });
  if (!startCheckinRecord) {
    logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: no start-checkin row today — field-sync + judge-group writes SKIPPED', { caseId });
    return;
  }

  const oldJudge = existingDocket.judge;
  const newJudge = updateFields.judge;
  const judgeChanged = newJudge !== undefined && newJudge !== oldJudge;
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: judge-change check', { caseId, oldJudge, newJudge, judgeChanged });

  if (!judgeChanged) {
    logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: judge unchanged → field-sync only', { caseId });
    await updateDocketDataInCheckinCalendar(updateFields, caseId, userId);
    return;
  }

  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: judge changed → resolving judge IDs + group handling', { caseId, oldJudge, newJudge });
  const oldJudgeId = await lookupJudgeUserId(oldJudge);
  // Count how many cases the old judge has in start-checkin today
  const oldJudgeCaseCount = await CheckinCalendarTodayDate.count({
    where: { judgeId: oldJudgeId, hearingDate: today, startCheckin: '1' },
  });
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: old judge resolved', { caseId, oldJudge, oldJudgeId, oldJudgeCaseCount, isSingleCase: oldJudgeCaseCount === 1 });

  await updateDocketDataInCheckinCalendar(updateFields, caseId, userId);

  const newJudgeId = await lookupJudgeUserId(newJudge);
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: new judge resolved', { caseId, newJudge, newJudgeId });
  if (newJudgeId > 0) {
    await updateCheckinCalendarGroupForJudgeChange(oldJudgeId, oldJudgeCaseCount === 1, newJudgeId);
  } else {
    logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate: new judge not resolved (id<=0) — group write SKIPPED', { caseId, newJudge });
  }
  logger.info('[checkinCalendarHelper] processStartCheckinRecordUpdate ── end', { caseId });
}

// Mirrors PHP block: set docket_status_updated_today when status changes or case is rescheduled later.
async function applyDocketStatusFlag(caseId, existingDocket, updateFields) {
  const statusChanged = updateFields.status !== undefined && updateFields.status !== existingDocket.status;
  const rescheduledWithLaterDate = updateFields.status === 'Rescheduled'
    && updateFields.hearingDate !== undefined
    && existingDocket.hearingDate < updateFields.hearingDate;
  logger.info('[checkinCalendarHelper] applyDocketStatusFlag ── condition 3 check (independent of field-sync)', {
    caseId,
    oldStatus: existingDocket.status,
    newStatus: updateFields.status,
    statusChanged,
    oldHearingDate: existingDocket.hearingDate,
    newHearingDate: updateFields.hearingDate,
    rescheduledWithLaterDate,
    willWrite: statusChanged || rescheduledWithLaterDate,
  });
  if (statusChanged || rescheduledWithLaterDate) {
    await updateDocketStatusFlagInCheckinCalendar(caseId);
  } else {
    logger.info('[checkinCalendarHelper] applyDocketStatusFlag: neither condition met — status-flag write SKIPPED', { caseId });
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
/**
 * @description Syncs checkin_calendar_today_date after a docket general-info update.
 *              Mirrors PHP updatedocketAction() lines 2173–2216.
 *              Only runs when the docket's OLD hearing date is today.
 *              Non-fatal: any failure is swallowed so the docket update is never blocked.
 *
 * @param {string|number} caseId
 * @param {Object} existingDocket  - Docket row fetched BEFORE the update (old values)
 * @param {Object} updateFields    - Camel-case fields that were applied to the docket
 * @param {Object} opts
 * @param {number} opts.userId     - Integer user ID (for checkin table modified_by column)
 */
export async function updateStartCheckinCalendarOnDocketUpdate(caseId, existingDocket, updateFields, { userId } = {}) {
  logger.info('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate ══ ENTRY', { caseId, updateFields, userId });
  try {
    const oldHearingDate = existingDocket.hearingDate
      ? new Date(existingDocket.hearingDate).toISOString().slice(0, 10)
      : null;
    const today = TODAY();
    const gatePassed = oldHearingDate === today;
    logger.info('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate ── condition 1 (top-level gate): pre-edit hearing date must equal today', {
      caseId, oldHearingDate, today, gatePassed,
    });
    if (!gatePassed) {
      logger.info('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate: gate FAILED — no checkin_calendar_today_date write of any kind for this docket', { caseId });
      return;
    }

    // Frozen-snapshot guard (see checkinGuard.js) - if today's hearing has already been
    // finalized into past_calendar_snapshot, skip the sync write rather than mutating a
    // record that's supposed to be a permanent historical snapshot. Non-fatal by design,
    // same as every other branch in this function - the docket update itself must go
    // through either way.
    const frozen = await PastCalendarSnapshot.findOne({
      where: { docketCaseId: caseId, hearingDate: today, activePastCalendar: '1' },
      attributes: ['id'],
    });
    if (frozen) {
      logger.warn('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate: today\'s checkin record is already an Active past-calendar snapshot — sync write SKIPPED', { caseId, today });
      return;
    }

    logger.info('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate: gate PASSED — proceeding to field-sync + status-flag checks', { caseId });
    await processStartCheckinRecordUpdate(caseId, existingDocket, updateFields, userId);
    await applyDocketStatusFlag(caseId, existingDocket, updateFields);
    logger.info('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate ══ EXIT (success)', { caseId });
  } catch (err) {
    // Non-fatal: checkin calendar sync must not block the docket update
    logger.error('[checkinCalendarHelper] updateStartCheckinCalendarOnDocketUpdate failed for caseId', caseId, err?.message ?? err);
  }
}

// ─── Case Official re-sync on agencycaseworkerbycase party change ────────────
/**
 * @description Re-derives checkin_calendar_today_date.case_official via
 *              checkinSharedHelpers.js's pickCaseOfficial() and writes it back
 *              whenever an agencycaseworkerbycase party (the sole source table
 *              for the Officer/Investigator/Case Worker/Agency Contact roles)
 *              is added, edited, or deleted for a docket - keeping the
 *              already-checked-in row's Case Official cell from going stale
 *              (e.g. the currently-shown caseworker is deleted, a newer one
 *              of the same resolved type is added, or an edit changes which
 *              record is the most-recently-created one of that type).
 *
 *              Only writes when the docket already has a start_checkin = 1
 *              row for today (mirrors updateDocketDataInCheckinCalendar's own
 *              gate above - nothing to re-sync before check-in has started),
 *              and skips a day that's already been finalized into
 *              past_calendar_snapshot (same frozen-snapshot guard used by
 *              updateStartCheckinCalendarOnDocketUpdate). Non-fatal: any
 *              failure here must never block the party save that already
 *              committed by the time this runs - same contract as every
 *              other function in this module.
 *
 * @param {string|number} caseId   - Docket case ID (agencycaseworkerbycase.caseid)
 * @param {Object}        opts
 * @param {number}        opts.userId - Integer user ID for checkin table modified_by column
 */
export async function resyncCaseOfficialOnPartyChange(caseId, { userId } = {}) {
  const today = TODAY();
  logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange ══ ENTRY', { caseId, today });
  try {
    const existing = await CheckinCalendarTodayDate.findOne({
      where: { docketCaseId: caseId, hearingDate: today, startCheckin: '1' },
      attributes: ['id', 'caseType', 'agency', 'caseOfficial'],
    });
    if (!existing) {
      logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange: no start-checkin row for today — skipped', { caseId });
      return;
    }

    const frozen = await PastCalendarSnapshot.findOne({
      where: { docketCaseId: caseId, hearingDate: today, activePastCalendar: '1' },
      attributes: ['id'],
    });
    if (frozen) {
      logger.warn('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange: today\'s checkin record is already an Active past-calendar snapshot — sync write SKIPPED', { caseId, today });
      return;
    }

    // ORDER BY created_date DESC — pickCaseOfficial takes the first match of
    // the resolved typeofcontact, i.e. the most-recently-created record.
    const officials = await AgencyCaseworkerByCase.findAll({
      where: { caseId },
      attributes: ['lastName', 'firstName', 'typeOfContact'],
      order: [['createdDate', 'DESC']],
      raw: true,
    });
    const newCaseOfficial = pickCaseOfficial(officials, existing.caseType, existing.agency);
    logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange: resolved case official', {
      caseId, caseType: existing.caseType, agency: existing.agency, previous: existing.caseOfficial, resolved: newCaseOfficial,
    });

    if ((newCaseOfficial || null) === (existing.caseOfficial || null)) {
      logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange: unchanged — no write', { caseId });
      return;
    }

    await CheckinCalendarTodayDate.update(
      { caseOfficial: newCaseOfficial, modifiedBy: userId ?? 0, modifiedDate: new Date() },
      { where: { id: existing.id } },
    );
    await insertDocketHistory(
      String(caseId),
      '<p class="history-title">Case Official updated after a party change.</p>' +
        `<p><span class="history-label"> Case Official:</span><span class="history-data">${newCaseOfficial || ''}</span></p>` +
        `<br/><p class="history-title"><strong>Previous Entry: </strong></p>` +
        `<p><span class="history-label"> Case Official:</span><span class="history-data">${existing.caseOfficial || ''}</span></p>`,
      String(userId ?? 0),
    );
    logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange: checkin_calendar_today_date.case_official UPDATED', { caseId, newCaseOfficial });
  } catch (err) {
    // Non-fatal: the party save already committed — this cascade must never
    // surface an error to the party-save caller.
    logger.error('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange failed for caseId', caseId, err?.message ?? err);
  }
  logger.info('[checkinCalendarHelper] resyncCaseOfficialOnPartyChange ══ EXIT', { caseId });
}
