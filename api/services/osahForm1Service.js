import Docket from '../models/Docket.js';
import { insertDocketHistory, checkHearingDateManual } from '../helpers/osahForm1Helper.js';
import { recordDocketHistory } from '../helpers/docketDetail/osahForm1DocketHistoryHelper.js';
import { updateStartCheckinCalendarOnDocketUpdate } from '../helpers/checkinCalendarHelper.js';
import { followAssignedJudgeAndStaffAttorneyHelper } from '../helpers/notification/followDocketHelper.js';
import DocketDisposition from '../models/DocketDisposition.js';
import DocketOpenCloseDetails from '../models/DocketOpenCloseDetails.js';
import EcourtMailvendorDocuments from '../models/EcourtMailvendorDocuments.js';
import DocumentsTable from '../models/DocumentsTable.js';
import { mysqlSequelize } from '../../connections/seqDB.js';
import { logger } from '../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-03-13
  Description : Business-logic layer for OSAH Form 1 (New Docket).
                Handles docket creation, update, and history recording.
                Follows the same service-layer pattern used in efilingService.js.
                History/notification logic lives in osahForm1DocketHistoryHelper.js.
                Checkin-calendar sync logic lives in checkinCalendarHelper.js.
*/

const UNASSIGNED_LOCATION = 'UNASSIGNED';

function getJudgeFirstSegment(judgeName) {
  if (!judgeName || typeof judgeName !== 'string') return '';
  return judgeName.trim().split(/\s+/)[0] || '';
}

/**
 * Field mapping from update-docket camelCase request keys to model fields.
 * @private
 */
const DOCKET_FIELD_MAP = {
  agencyRefNumber: 'agencyRefNumber',
  refAgency: 'refAgency',
  caseType: 'caseType',
  caseFileType: 'caseFileType',
  county: 'county',
  status: 'status',
  dateRequested: 'dateRequested',
  dateReceivedByOSAH: 'dateReceivedByOSAH',
  hearingMode: 'hearingMode',
  hearingSite: 'hearingSite',
  hearingDate: 'hearingDate',
  hearingTime: 'hearingTime',
  hearingTimeId: 'hearingTimeId',
  judge: 'judge',
  judgeAssistant: 'judgeAssistant',
  staffAttorney: 'staffAttorney',
  docketClerk: 'docketClerk',
  caseName: 'caseName',
  tempPermits: 'tempPermits',
  telvOFive: 'telvOFive',
};

function buildUpdateFields(docketDetails) {
  const updateFields = {};
  Object.entries(DOCKET_FIELD_MAP).forEach(([key, modelKey]) => {
    if (docketDetails[key] !== undefined) {
      updateFields[modelKey] = docketDetails[key];
    }
  });
  return updateFields;
}

// Exported so officerHearingReassignmentHelper.js (Officer-party county-hearing
// reassignment cascade) can recompute the docket number the same way updateDocket() does.
export function buildDocketNumber({ refAgency, caseType, caseId, countyId, judge }) {
  const normalizedCountyId = countyId === undefined || countyId === null || countyId === ''
    ? UNASSIGNED_LOCATION
    : String(countyId).trim();

  return [
    refAgency || '',
    caseType || '',
    caseId,
    normalizedCountyId || UNASSIGNED_LOCATION,
    getJudgeFirstSegment(judge),
  ].join('-');
}

/**
 * @function createDocket
 * @description Creates a docket, generates its number, and updates the record.
 *              Replicates legacy Osahform/adddocket.
 * @param {Object} docketDetails - Docket data
 * @param {number} contyId - County ID
 * @returns {Promise<Object>} Created docket info
 */
export async function addDocket(docketDetails, contyId) {
  const now = new Date();

  // 1. Insert the new docket row (minimal set as per PHP)
  const newDocket = await Docket.create({
    docketClerk:       docketDetails.docketclerk      || null,
    dateRequested:     docketDetails.daterequested     || null,
    dateReceivedByOSAH: docketDetails.datereceivedbyOSAH || null,
    refAgency:         docketDetails.refagency         || null,
    caseType:          docketDetails.casetype          || null,
    county:            docketDetails.county            || null,
    agencyRefNumber:   docketDetails.agencyrefnumber   || null,
    status:            docketDetails.status            || 'Pending',
    hearingMode:       docketDetails.hearingmode       || null,
    hearingSite:       docketDetails.hearingsite       || null,
    hearingDate:       docketDetails.hearingdate       || null,
    hearingTime:       docketDetails.hearingtime       || null,
    judge:             docketDetails.judge             || null,
    judgeAssistant:    docketDetails.judgeassistant    || null,
    staffAttorney:     docketDetails.staffattorney     || null,
    caseFileType:      docketDetails.casefiletype      || null,
    telvOFive:         docketDetails.telv_o_five       || '1',
    docketCreatedDate: now,
  });

  const docketId = newDocket.caseId;

  // 2. Generate docket number: refagency-casetype-docketid-countyid-JudgeLastName
  // Mirrors PHP: $judge_firstname = explode(' ', $judge_name)[0] (first word of "LastName FirstName")
  // Falls back to 'Unassigned' when no judge is assigned
  const judgeLastName = docketDetails.judge
    ? (docketDetails.judge.split(' ')[0] || 'Unassigned')
    : 'Unassigned';
  const docketNo = [
    docketDetails.refagency,
    docketDetails.casetype,
    docketId,
    contyId,
    judgeLastName,
  ].join('-');

  // 3. Update the docket record with the generated docket number
  await Docket.update(
    { docketNumber: docketNo },
    { where: { caseId: docketId } }
  );

  // 4. Auto-follow the assigned Judge / Staff Attorney (product rule: they never
  //    click "Notify Me" themselves — only CMA/JA/other internal users do).
  //    Non-fatal: never blocks docket creation on a follow-seeding failure.
  try {
    await followAssignedJudgeAndStaffAttorneyHelper({
      caseId: docketId,
      agencyCode: docketDetails.refagency,
      caseType: docketDetails.casetype,
      judge: docketDetails.judge,
      staffAttorney: docketDetails.staffattorney,
    });
  } catch (error) {
    logger.error('[osahForm1Service.addDocket] Failed to auto-follow assigned judge/SA:', {
      error: error.message,
      docketId,
    });
  }

  return { docketId, docketNo, status: true };
}

/**
 * @description Updates an existing docket record.
 *              Replicates DdsController::updatedocketAction().
 *
 * @param {number|string} caseId    - Primary key of the docket to update
 * @param {Object}          docketInfo - Fields to update (only provided fields are changed)
 * @param {Object}        options    - Reopen flag, county, user identity
 * @returns {Promise<{ found: boolean, rowsAffected: number }>}
 */
export async function updateDocket(caseId, docketInfo, options = {}) {
  logger.info('[osahForm1Service.updateDocket] ── start', { caseId, docketInfo, options });

  const updateFields = buildUpdateFields(docketInfo);
  const isReopenSave = String(options.reopenCaseFlag ?? '0') === '1';
  const reopenHearingInfo = String(options.reopenHearingInfo ?? '').trim();
  const modifiedBy = options.modifiedBy || 'system';
  const userId = options.userId ?? 0;
  logger.info('[osahForm1Service.updateDocket] derived update fields', { caseId, updateFields, isReopenSave, reopenHearingInfo, modifiedBy, userId });

  // Captured inside the transaction so post-commit helpers can use old values
  let existingDocket = null;

  const { found, rowsAffected } = await mysqlSequelize.transaction(async (transaction) => {
    const docket = await Docket.findByPk(caseId, {
      attributes: [
        'caseId', 'refAgency', 'caseType', 'caseFileType', 'county', 'status',
        'dateRequested', 'dateReceivedByOSAH', 'hearingMode', 'hearingSite',
        'hearingDate', 'hearingTime', 'judge', 'judgeAssistant', 'staffAttorney',
        'docketClerk', 'caseName', 'tempPermits', 'telvOFive', 'agencyRefNumber',
      ],
      transaction,
    });

    if (!docket) {
      logger.info('[osahForm1Service.updateDocket] docket not found', { caseId });
      return { found: false, rowsAffected: 0 };
    }

    existingDocket = docket;
    logger.info('[osahForm1Service.updateDocket] pre-edit docket snapshot (existingDocket)', {
      caseId,
      hearingDate: docket.hearingDate,
      status: docket.status,
      judge: docket.judge,
      refAgency: docket.refAgency,
      caseType: docket.caseType,
      county: docket.county,
      hearingSite: docket.hearingSite,
      agencyRefNumber: docket.agencyRefNumber,
    });

    updateFields.docketNumber = buildDocketNumber({
      refAgency: updateFields.refAgency ?? docket.refAgency,
      caseType:  updateFields.caseType  ?? docket.caseType,
      caseId,
      countyId: options.countyId ?? options.locationId ?? UNASSIGNED_LOCATION,
      judge:    updateFields.judge ?? docket.judge,
    });
    logger.info('[osahForm1Service.updateDocket] built docketNumber', { caseId, docketNumber: updateFields.docketNumber });

    const [docketRowsAffected] = await Docket.update(updateFields, { where: { caseId }, transaction });
    let rowsAffected = docketRowsAffected;
    logger.info('[osahForm1Service.updateDocket] Docket.update applied', { caseId, docketRowsAffected });

    // Mirrors PHP: if($param['reopenCaseflg'] == '1') block
    if (isReopenSave) {
      logger.info('[osahForm1Service.updateDocket] reopen-case branch entered', { caseId });
      const existingDisposition = await DocketDisposition.findOne({
        where: { caseId }, attributes: ['caseId'], transaction,
      });
      logger.info('[osahForm1Service.updateDocket] reopen: existing disposition lookup', { caseId, found: !!existingDisposition });

      if (existingDisposition) {
        const destroyedRows = await DocketDisposition.destroy({ where: { caseId }, transaction });
        rowsAffected += destroyedRows;
        const [docRows] = await DocumentsTable.update(
          { rocFlag: 1 },
          { where: { caseId, documentType: 'Decision' }, transaction }
        );
        rowsAffected += docRows;
        logger.info('[osahForm1Service.updateDocket] reopen: disposition destroyed + Decision doc rocFlag set', { caseId, destroyedRows, docRows });
      }

      // Record reopen event in open/close audit trail
      await DocketOpenCloseDetails.create({ caseId, docketStatus: 're_opened', userId }, { transaction });
      logger.info('[osahForm1Service.updateDocket] reopen: DocketOpenCloseDetails audit row created', { caseId, userId });

      // Remove any pending mailvendor report entry for this case on reopen
      const mailvendorDoc = await EcourtMailvendorDocuments.findOne({
        where: { caseId }, attributes: ['documentId'], transaction,
      });
      if (mailvendorDoc) {
        await EcourtMailvendorDocuments.destroy({ where: { caseId }, transaction });
        logger.info('[osahForm1Service.updateDocket] reopen: pending mailvendor doc removed', { caseId, documentId: mailvendorDoc.documentId });
      }
    }

    logger.info('[osahForm1Service.updateDocket] transaction complete', { caseId, rowsAffected });
    return { found: true, rowsAffected };
  });

  // Post-transaction: mirrors PHP calling docketHistory() then checkin-calendar update
  // after all DB writes complete in updatedocketAction().
  if (found) {
    logger.info('[osahForm1Service.updateDocket] post-transaction: recording docket history', { caseId });
    await recordDocketHistory(caseId, existingDocket, updateFields, { isReopenSave, reopenHearingInfo, modifiedBy });

    logger.info('[osahForm1Service.updateDocket] post-transaction: entering checkin_calendar_today_date sync', { caseId });
    await updateStartCheckinCalendarOnDocketUpdate(caseId, existingDocket, updateFields, { modifiedBy, userId });
    logger.info('[osahForm1Service.updateDocket] post-transaction: checkin_calendar_today_date sync returned', { caseId });
  } else {
    logger.info('[osahForm1Service.updateDocket] skipping post-transaction steps — docket not found', { caseId });
  }

  logger.info('[osahForm1Service.updateDocket] ── end', { caseId, found, rowsAffected });
  return { found, rowsAffected };
}

/**
 * @description Validates a manually-entered hearing slot against capacity limits.
 *              Delegates to the helper's raw-SQL capacity check.
 *              Replicates legacy calendar/hearing-date-manual.
 *
 * @param {Object} condition - Validated hearing slot identifiers + token
 * @returns {Promise<{ token, hearingDateValEnteredByUser, error: string }>}
 */
export async function hearingDateManual(condition) {
  return await checkHearingDateManual(condition);
}

/**
 * @description Records a history entry after a docket action.
 *              Delegates to the helper's parameterized INSERT.
 *
 * @param {number} caseId     - Docket case ID
 * @param {string} message    - HTML history message
 * @param {string} modifiedBy - Username
 * @returns {Promise<number>} 1 on success (mirrors PHP echo 1)
 */
export async function addDocketHistory(caseId, message, modifiedBy) {
  return await insertDocketHistory(caseId, message, modifiedBy);
}

