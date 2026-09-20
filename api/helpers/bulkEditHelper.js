import { Op } from 'sequelize';
import { logger } from '../../config/winstonLogger.js';
import { mysqlSequelize } from '../../connections/seqDB.js';
import JudgeAssistantClerk from '../models/JudgeAssistantClerk.js';
import HearingTime from '../models/calendar/HearingTimeModel.js';
import CourtLocations from '../models/CourtLocations.js';
import Docket from '../models/Docket.js';
import County from '../models/County.js';
import { recordDocketHistory } from './docketDetail/osahForm1DocketHistoryHelper.js';

const MAX_BULK_UPDATE_LIMIT = 100;

/**
 * Get dropdown data for bulk edit modal
 * @returns {Promise<Object>} - Object containing judges, cmas, hearingTimes, and locations
 */
export const getBulkEditDropdownDataHelper = async () => {
  try {
    const JUDGE_ATTRS = ['userId', 'firstName', 'lastName', 'middleInitial', 'title', 'initials', 'phone', 'fax', 'email'];

    const judges = await JudgeAssistantClerk.findAll({
      attributes: JUDGE_ATTRS,
      where: { isActive: '1', userType: 'judge', firstName: { [Op.ne]: 'Test' } },
      order: [['lastName', 'ASC']],
    });

    const cmas = await JudgeAssistantClerk.findAll({
      attributes: JUDGE_ATTRS,
      where: { isActive: '1', userType: 'cma' },
      order: [['lastName', 'ASC']],
    });

    const hearingTimes = await HearingTime.findAll({
      attributes: ['timeId', 'hearingTimeStored', 'hearingTime'],
      where: { timeId: { [Op.ne]: 0 } },
      order: [['timeId', 'ASC']],
    });

    const locations = await CourtLocations.findAll({
      attributes: ['courtLocationId', 'locationName', 'state'],
      where: { courtLocationId: { [Op.ne]: 0 } },
      order: [['locationName', 'ASC']],
    });

    return { judges, cmas, hearingTimes, locations };
  } catch (error) {
    logger.error('Error getting bulk edit dropdown data:', error);
    throw error;
  }
};

const DOCKET_HISTORY_ATTRS = ['caseId', 'status', 'hearingDate', 'hearingTime', 'hearingTimeId', 'hearingSite', 'judge', 'judgeAssistant', 'refAgency', 'caseType', 'county'];

/**
 * Bulk update dockets — mirrors PHP bulkUpdateDocketAction().
 * When hearingDate is set: status becomes 'Hearing Scheduled' (was Pending) or 'Rescheduled'.
 * When judge is changed: docket number is regenerated as refagency-casetype-caseid-countyId-judgeLastName.
 * noHearingDate clears hearing fields and sets status to Pending; judge/CMA are NOT cleared (matching PHP).
 * History is logged per docket after the transaction, matching PHP docketHistory() call pattern.
 * @param {Object} formData
 * @param {Array} docketIds
 * @param {string} modifiedBy - logged-in user email (from req.email)
 */
export const bulkUpdateDocketsHelper = async (formData, docketIds, modifiedBy) => {
  try {
    if (!Array.isArray(docketIds) || docketIds.length === 0) throw new Error('No dockets selected for update');
    if (docketIds.length > MAX_BULK_UPDATE_LIMIT) throw new Error(`Cannot update more than ${MAX_BULK_UPDATE_LIMIT} dockets at once`);
    if (!docketIds.every((id) => Number.isInteger(Number(id)) && Number(id) > 0)) throw new Error('Invalid docket IDs provided');

    const { hearingDate, timeId, courtLocation, judge, cma, noHearingDate } = formData;

    if (hearingDate && Number.isNaN(Date.parse(hearingDate))) throw new Error('Invalid hearing date format');
    if (courtLocation && String(courtLocation).trim().length > 255) throw new Error('Court location value is too long');
    if (judge && String(judge).trim().length > 255) throw new Error('Judge value is too long');
    if (cma && String(cma).trim().length > 255) throw new Error('CMA value is too long');

    const baseUpdate = { modifiedDate: new Date() };

    if (noHearingDate) {
      Object.assign(baseUpdate, { hearingDate: null, hearingTime: null, hearingSite: null, hearingTimeId: null, status: 'Pending' });
    } else {
      if (hearingDate) baseUpdate.hearingDate = hearingDate;
      if (courtLocation) baseUpdate.hearingSite = String(courtLocation).trim();
      if (judge) baseUpdate.judge = String(judge).trim();
      if (cma) baseUpdate.judgeAssistant = String(cma).trim();
      if (timeId) baseUpdate.hearingTimeId = timeId;
    }

    if (Object.keys(baseUpdate).length <= 1) throw new Error('No fields to update');

    const needsPerDocket = !!judge && !noHearingDate;
    const needsStatusUpdate = !!hearingDate && !noHearingDate;

    // Fetch before updating — needed for history comparison and per-docket logic
    const existing = await Docket.findAll({
      attributes: DOCKET_HISTORY_ATTRS,
      where: { caseId: { [Op.in]: docketIds } },
      raw: true,
    });

    // Tracks the exact update applied to each docket (status may differ per docket)
    const docketUpdateMap = new Map();

    await mysqlSequelize.transaction(async (t) => {
      if (timeId && !noHearingDate) {
        const timeRecord = await HearingTime.findOne({ attributes: ['hearingTimeStored'], where: { timeId }, transaction: t });
        if (timeRecord) baseUpdate.hearingTime = timeRecord.hearingTimeStored;
      }

      if (needsPerDocket) {
        const uniqueCounties = [...new Set(existing.map((d) => d.county).filter(Boolean))];
        const countyRecords = await County.findAll({
          attributes: ['countyId', 'countyDescription'],
          where: { countyDescription: { [Op.in]: uniqueCounties } },
          transaction: t,
          raw: true,
        });
        const countyMap = new Map(countyRecords.map((c) => [c.countyDescription, c.countyId]));
        const judgeLastName = String(judge).trim().split(' ')[0] || 'UNASSIGNED';

        for (const docket of existing) {
          const countyId = countyMap.get(docket.county) || 0;
          const docketNumber = `${docket.refAgency}-${docket.caseType}-${docket.caseId}-${countyId}-${judgeLastName}`;
          const perUpdate = { ...baseUpdate, docketNumber };
          if (needsStatusUpdate) {
            perUpdate.status = docket.status === 'Pending' ? 'Hearing Scheduled' : 'Rescheduled';
          }
          docketUpdateMap.set(docket.caseId, perUpdate);
          await Docket.update(perUpdate, { where: { caseId: docket.caseId }, transaction: t });
        }
      } else if (needsStatusUpdate) {
        const pendingIds = existing.filter((d) => d.status === 'Pending').map((d) => d.caseId);
        const otherIds = existing.filter((d) => d.status !== 'Pending').map((d) => d.caseId);
        existing.forEach((d) => {
          docketUpdateMap.set(d.caseId, { ...baseUpdate, status: d.status === 'Pending' ? 'Hearing Scheduled' : 'Rescheduled' });
        });
        if (pendingIds.length) {
          await Docket.update({ ...baseUpdate, status: 'Hearing Scheduled' }, { where: { caseId: { [Op.in]: pendingIds } }, transaction: t });
        }
        if (otherIds.length) {
          await Docket.update({ ...baseUpdate, status: 'Rescheduled' }, { where: { caseId: { [Op.in]: otherIds } }, transaction: t });
        }
      } else {
        existing.forEach((d) => docketUpdateMap.set(d.caseId, baseUpdate));
        await Docket.update(baseUpdate, { where: { caseId: { [Op.in]: docketIds } }, transaction: t });
      }
    });

    // Log history after transaction commits — mirrors PHP docketHistory() call pattern
    for (const docket of existing) {
      const updateFields = docketUpdateMap.get(docket.caseId) || baseUpdate;
      await recordDocketHistory(docket.caseId, docket, updateFields, { isReopenSave: false, reopenHearingInfo: null, modifiedBy });
    }

    logger.info(`Bulk updated ${docketIds.length} dockets`);
    return { success: docketIds, failure: [], message: `Successfully updated ${docketIds.length} docket(s)` };
  } catch (error) {
    logger.error('Error in bulk update dockets:', error);
    throw error;
  }
};

