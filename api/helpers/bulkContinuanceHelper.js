import { mysqlSequelize } from '../../connections/seqDB.js';
import { Op } from 'sequelize';
import { logger } from '../../config/winstonLogger.js';
import Docket from '../models/Docket.js';
import Cuttoffdate from '../models/cuttoffdateModel.js';
import Casetypes from '../models/Casetypes.js';
import County from '../models/County.js';
import { getMatchedCasetypeMappings, getMappingAutomations } from '../services/documentTemplateMappingService.js';
import {
  getContinuanceTemplateDoc,
  getContinuanceTemplateDocById,
  getContinuanceDocketDetails,
  generateAndSaveContinuancePdf,
  saveContinuanceDocumentRecord,
  updateDocketForContinuance,
  insertDocumentTemplateAddedHistory,
  insertContinuanceDocketHistory,
  insertContinuanceAutomationReport,
  updateCheckinCalendarForContinuance,
} from '../services/continuanceDocumentService.js';
import { buildNOHMergeData } from '../services/nohDocumentService.js';
import { sendContinuanceEmailNotification } from './docketQuickAction/quickActionEmailNotificationHelper.js';
import { isEligibleForBulkPartyCount } from './docketDetail/partyDetailsHelper.js';

const MAX_BULK_LIMIT = 100;

/** Groups selected dockets by agency|casetype|county and returns dropdown data including CountyID/Casetypeid. */
export const getContinuanceDropdownDataHelper = async (caseIds) => {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    throw new Error('caseIds must be a non-empty array');
  }

  // Step 1: Get distinct (refAgency, caseType, county) groups for the selected dockets.
  const docketGroups = await Docket.findAll({
    attributes: ['refAgency', 'caseType', 'county'],
    where: { caseId: { [Op.in]: caseIds } },
    group: ['refAgency', 'caseType', 'county'],
    raw: true,
  });

  const displayData = {};
  if (docketGroups.length === 0) return displayData;

  const uniqueAgencies  = [...new Set(docketGroups.map((g) => g.refAgency))];
  const uniqueCaseTypes = [...new Set(docketGroups.map((g) => g.caseType))];
  const uniqueCounties  = [...new Set(docketGroups.map((g) => g.county).filter(Boolean))];
  const validAgencyCaseTypePairs = new Set(docketGroups.map((g) => `${g.refAgency}|${g.caseType}`));

  // Step 2: Fetch matching casetype mapping rows (exact match or agency-level wildcard).
  const mappings = await getMatchedCasetypeMappings(uniqueAgencies, uniqueCaseTypes);
  const matchedCtDocs = mappings.filter(
    (m) => m.isAllCasetypes === 1 || validAgencyCaseTypePairs.has(`${m.agency}|${m.caseType}`),
  );
  const matchedDocIds = matchedCtDocs.map((d) => d.id);

  // Step 3: Fetch automation rows for continuance.
  const rawAutomations = await getMappingAutomations(matchedDocIds, 'continuance');
  const automations = rawAutomations.map((a) => ({ mappingId: a.mappingId, templateId: a.templateId, automationSubType: a.automationSubType }));

  // Step 4: Fetch Casetypeid for each (refAgency, caseType) pair.
  const casetypesRows = await Casetypes.findAll({
    attributes: ['caseTypeId', 'agencyCode', 'caseCode'],
    where: { agencyCode: { [Op.in]: uniqueAgencies }, caseCode: { [Op.in]: uniqueCaseTypes } },
    raw: true,
  });
  const casetypeMap = {};
  casetypesRows
    .filter((r) => validAgencyCaseTypePairs.has(`${r.agencyCode}|${r.caseCode}`))
    .forEach((r) => { casetypeMap[`${r.agencyCode}|${r.caseCode}`] = r.caseTypeId; });

  // Step 5: Fetch CountyID for each county name.
  const countyRows = uniqueCounties.length > 0
    ? await County.findAll({
        attributes: ['countyId', 'countyDescription'],
        where: { countyDescription: { [Op.in]: uniqueCounties } },
        raw: true,
      })
    : [];
  const countyMap = {};
  countyRows.forEach((r) => { countyMap[r.countyDescription] = r.countyId; });

  // Step 6: Reverse-map mappingId → its mapping row (agency, caseType, isAllCasetypes).
  const docIdToMapping = {};
  matchedCtDocs.forEach((d) => { docIdToMapping[d.id] = d; });

  // Step 7: Build displayData — one entry per (refAgency|caseType|county) group.
  const seenTemplates = new Set();
  automations.forEach(({ mappingId, templateId, automationSubType }) => {
    const mapping = docIdToMapping[mappingId];
    if (!mapping) return;

    // Fan out to every docket group that matches this mapping — exact agency+caseType,
    // or any caseType under the same agency when the mapping is an "All" wildcard row.
    docketGroups.forEach(({ refAgency, caseType, county }) => {
      const matchesGroup = mapping.isAllCasetypes === 1
        ? refAgency === mapping.agency
        : refAgency === mapping.agency && caseType === mapping.caseType;
      if (!matchesGroup) return;

      const key = `${refAgency}|${caseType}|${county}`;
      if (!displayData[key]) {
        displayData[key] = {
          data: [],
          CountyID: countyMap[county] ?? null,
          Casetypeid: casetypeMap[`${refAgency}|${caseType}`] ?? null,
          hearingdate: '',
          hearingtime: '',
        };
      }

      // Dedupe on the template, not the subtype label — two different active templates can
      // share the same automationSubType text and must both stay individually selectable.
      const dedupeKey = `${key}|${templateId}`;
      if (seenTemplates.has(dedupeKey)) return;
      seenTemplates.add(dedupeKey);
      displayData[key].data.push({ automation_sub_type: automationSubType, documentId: templateId });
    });
  });

  return displayData;
};

/**
 * Returns next available calendar date for a casetype+county. When currentHearingDate is provided,
 * only returns dates after it (mirrors PHP case_id behaviour). Returns null when none available.
 */
export const getNextCalendarDateHelper = async (casetypeId, countyId, currentHearingDate = null) => {
  const cutoffRow = await Cuttoffdate.findOne({
    attributes: ['cutoffDaysDifference'],
    where: { casetypeId, isActive: '1' },
    raw: true,
  });

// ---------------------------------------------------------------------------
// Raw SQL is intentionally used here because the query relies on:
// - HAVING with aggregate aliases
// - MySQL-specific functions (DATE_FORMAT, CURDATE)
// - Conditional WHERE logic across two query variants
// - Complex multi-table joins without Sequelize associations
//
// Converting this to Sequelize would require extensive use of literals/functions,
// reducing readability without improving safety. All user inputs are passed as
// named replacements, preventing SQL injection.
// ---------------------------------------------------------------------------

// When a cutoff exists, calculate the threshold date in JS and pass it as a
// named replacement. Separate queries are used because the comparison column
// differs (hearing_date vs cutoff_date).
  const calendarSql = `
     SELECT DATE_FORMAT(hr.hearing_date,'%m-%d-%Y') AS hearing_date,
            ht.heringtimestored                     AS time,
            hr.no_of_cases,
            COUNT(d.caseid)                         AS no_of_cases_docketed
     FROM   v2_5_calendar cal
     JOIN   v2_5_calendar_casetype calct ON cal.id = calct.calendar_id
     JOIN   v2_5_county_circuit_map cn   ON cal.circuit_id = cn.circuit_id
     JOIN   v2_5_calendar_hearing_info hr ON cal.id = hr.calendar_id
     JOIN   hearingtime ht                ON hr.time_id = ht.timeid
     JOIN   casetypes ct                  ON calct.casetype_id = ct.casetypeid
     LEFT JOIN docket d
            ON d.hearingdate = hr.hearing_date AND d.hearingtime = ht.heringtimestored`;
  const calendarTail = `
     GROUP BY hr.id, hr.hearing_date, ht.heringtimestored, hr.no_of_cases
     HAVING (no_of_cases_docketed < no_of_cases OR no_of_cases_docketed = 0 OR no_of_cases IS NULL)
     ORDER BY hr.hearing_date, ht.heringtimestored
     LIMIT 1`;

  const currentHearingDateClause = currentHearingDate ? ' AND hr.hearing_date > :currentHearingDate' : '';

  let rows;
  if (cutoffRow) {
    const days = parseInt(cutoffRow.cutoffDaysDifference, 10) || 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    rows = await mysqlSequelize.query(
      `${calendarSql}
       WHERE  calct.casetype_id = :casetypeId AND cn.county_id = :countyId
         AND  hr.hearing_date > :cutoffDate${currentHearingDateClause}
       ${calendarTail}`,
      {
        replacements: { casetypeId, countyId, cutoffDate: cutoffDateStr, ...(currentHearingDate ? { currentHearingDate } : {}) },
        type: mysqlSequelize.QueryTypes.SELECT,
      }
    );
  } else {
    rows = await mysqlSequelize.query(
      `${calendarSql}
       WHERE  calct.casetype_id = :casetypeId AND cn.county_id = :countyId
         AND  hr.cutoff_date > CURDATE()${currentHearingDateClause}
       ${calendarTail}`,
      {
        replacements: { casetypeId, countyId, ...(currentHearingDate ? { currentHearingDate } : {}) },
        type: mysqlSequelize.QueryTypes.SELECT,
      }
    );
  }

  return rows.length > 0 ? { hearing_date: rows[0].hearing_date, time: rows[0].time } : null;
};

/**
 * Generates Continuance documents in bulk. Skips Closed/Reconsideration dockets.
 * Per docket: fetch template → fetch details → update docket → generate PDF → transact DB writes → update check-in calendar.
 */
async function processOneContinuanceDocket(docket, groupData, username) {
  const { caseId, refAgency, caseType } = docket;

  // documentId picks the exact template when two active templates share the same subtype label.
  const templateDoc = groupData.documentId
    ? await getContinuanceTemplateDocById(refAgency, caseType, groupData.documentId)
    : await getContinuanceTemplateDoc(refAgency, caseType, groupData.automation_sub_type);
  if (!templateDoc) {
    throw new Error(`No Continuance template found for agency=${refAgency}, casetype=${caseType}, subtype=${groupData.automation_sub_type}`);
  }

  const fullDocket = await getContinuanceDocketDetails(caseId);
  if (!fullDocket) {
    throw new Error(`Docket details not found for caseid=${caseId}`);
  }
  const pastHearingDate = fullDocket.currentHearingDate || null;
  const pastHearingTime = fullDocket.currentHearingTime || null;

  const mergeData = await buildNOHMergeData(caseId, { hearingDate: groupData.hearingdate, hearingTime: groupData.hearingtime });

  await updateDocketForContinuance(caseId, groupData.hearingdate, groupData.hearingtime);

  const { attachmentPath, pdfFileName } = await generateAndSaveContinuancePdf(caseId, templateDoc, mergeData);

  const t = await mysqlSequelize.transaction();
  try {
    await saveContinuanceDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);
    await insertDocumentTemplateAddedHistory(
      caseId, pdfFileName, templateDoc.documenttype || 'Continuance', groupData.automation_sub_type, username, t,
    );
    await insertContinuanceDocketHistory(caseId, username, groupData.hearingdate, groupData.hearingtime, t, 'No');
    await insertContinuanceAutomationReport(fullDocket, groupData.automation_sub_type, groupData.hearingdate, pastHearingDate, t, '1');
    await t.commit();
  } catch (error_) {
    await t.rollback();
    throw error_;
  }

  try {
    await updateCheckinCalendarForContinuance(caseId, pastHearingDate, pastHearingTime, 0);
  } catch (error_) {
    logger.error(`[BulkContinuance] Check-in calendar update failed for caseId=${caseId}:`, error_);
  }
  // Mirrors PHP: sendDocTemplateEmailNotification(flag='continuance') — non-fatal, catches internally
  await sendContinuanceEmailNotification(caseId, refAgency, caseType);
  logger.info(`Continuance (${groupData.automation_sub_type}) generated successfully for docket ${caseId}`);
}

export const generateBulkContinuanceHelper = async (caseIds, groupState, username = '') => {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    throw new Error('No dockets selected for Continuance generation');
  }
  if (caseIds.length > MAX_BULK_LIMIT) {
    throw new Error(`Cannot process more than ${MAX_BULK_LIMIT} dockets at once`);
  }

  const dockets = await Docket.findAll({
    attributes: ['caseId', 'refAgency', 'caseType', 'county', 'status'],
    where: { caseId: { [Op.in]: caseIds } },
    raw: true,
  });

  const success = [];
  const failure = [];

  for (const docket of dockets) {
    const { caseId, refAgency, caseType, county, status } = docket;
    const groupKey = `${refAgency}|${caseType}|${county}`;
    const groupData = groupState[groupKey];

    if (!groupData?.hearingdate || !groupData?.hearingtime || !groupData?.automation_sub_type) {
      failure.push({ caseid: caseId, reason: 'Missing hearing date, time, or continuance type' });
      continue;
    }

    // Mirrors PHP bulkContinuanceAutomation's party-count gate — the mail-merge letter template
    // can't be populated for a docket with no parties or with more than it has slots for.
    if (!(await isEligibleForBulkPartyCount(caseId))) {
      failure.push({ caseid: caseId, reason: 'Docket has no parties, or too many parties (max 6), for bulk Continuance generation' });
      continue;
    }

    if (status === 'Closed' || status === 'Reconsideration') {
      failure.push({ caseid: caseId, reason: `Docket status '${status}' is not eligible for Continuance` });
      continue;
    }

    try {
      await processOneContinuanceDocket(docket, groupData, username);
      success.push(caseId);
    } catch (err) {
      logger.error(`Continuance generation failed for docket ${caseId}:`, err);
      failure.push({ caseid: caseId, reason: err.message });
    }
  }

  return {
    success,
    failure,
    message: `Continuance processed: ${success.length} succeeded, ${failure.length} failed`,
  };
};
