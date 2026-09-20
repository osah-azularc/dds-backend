import { mysqlSequelize } from '../../connections/seqDB.js'; // used for transactions
import { Op } from 'sequelize';
import { logger } from '../../config/winstonLogger.js';
import Docket from '../models/Docket.js';
import PeopleDetails from '../models/PeopleDetails.js';
import { getMatchedCasetypeMappings, getMappingAutomations } from '../services/documentTemplateMappingService.js';
import {
  getDispositionTemplateDoc,
  getDispositionTemplateDocById,
  getDispositionDocketDetails,
  generateAndSaveDispositionPdf,
  saveDispositionDocumentRecord,
  insertDispositionDocumentTemplateHistory,
  upsertDocketDisposition,
  closeDocket,
  insertDocketOpenCloseDetails,
  insertDispositionDocketHistory,
  insertDispositionAutomationReport,
} from '../services/dispositionDocumentService.js';
import { buildNOHMergeData } from '../services/nohDocumentService.js';
import { sendDispositionEmailNotification } from './docketQuickAction/quickActionEmailNotificationHelper.js';
import { saveMailVendorRecord } from './docketQuickAction/mailVendorHelper.js';
import { isEligibleForBulkPartyCount } from './docketDetail/partyDetailsHelper.js';

const MAX_BULK_LIMIT = 100;

/**
 * Get grouped Disposition display data for selected dockets.
 * Groups by agency|casetype (flag=1 logic from legacy documentTypesInBulkAction).
 * Returns available decision sub-types per group.
 *
 * @param {Array} caseIds - Selected docket case IDs
 * @returns {Promise<Object>} displayData keyed by "agency|casetype"
 */
export const getDispositionDropdownDataHelper = async (caseIds) => {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    throw new Error('caseIds must be a non-empty array');
  }

  // Step 1: Get distinct (refAgency, caseType) pairs for the selected dockets.
  const docketGroups = await Docket.findAll({
    attributes: ['refAgency', 'caseType'],
    where: { caseId: { [Op.in]: caseIds } },
    group: ['refAgency', 'caseType'],
    raw: true,
  });

  // Initialise all groups with empty data (groups with no template show "Not Available").
  const displayData = {};
  docketGroups.forEach(({ refAgency, caseType }) => {
    displayData[`${refAgency}|${caseType}`] = { data: [] };
  });

  if (docketGroups.length === 0) return displayData;

  // Step 2: Fetch matching casetype mapping rows (exact match or agency-level wildcard).
  const uniqueAgencies = [...new Set(docketGroups.map((g) => g.refAgency))];
  const uniqueCaseTypes = [...new Set(docketGroups.map((g) => g.caseType))];
  const validPairs = new Set(docketGroups.map((g) => `${g.refAgency}|${g.caseType}`));

  const mappings = await getMatchedCasetypeMappings(uniqueAgencies, uniqueCaseTypes);
  const matchedCtDocs = mappings.filter((m) => m.isAllCasetypes === 1 || validPairs.has(`${m.agency}|${m.caseType}`));
  const matchedDocIds = matchedCtDocs.map((d) => d.id);

  if (matchedDocIds.length === 0) return displayData;

  // Step 3: Fetch automation rows for those mapping IDs.
  const rawAutomations = await getMappingAutomations(matchedDocIds, 'decision');
  const automations = rawAutomations.map((a) => ({ mappingId: a.mappingId, templateId: a.templateId, automationSubType: a.automationSubType }));

  // Step 4: Reverse-map mappingId → its mapping row and populate displayData. Wildcard
  // (isAllCasetypes) rows fan out to every docket group under the same agency.
  const docIdToMapping = {};
  matchedCtDocs.forEach((d) => { docIdToMapping[d.id] = d; });

  const seenTemplates = new Set();
  automations.forEach(({ mappingId, templateId, automationSubType }) => {
    const mapping = docIdToMapping[mappingId];
    if (!mapping) return;

    const matchingGroups = mapping.isAllCasetypes === 1
      ? docketGroups.filter((g) => g.refAgency === mapping.agency)
      : docketGroups.filter((g) => g.refAgency === mapping.agency && g.caseType === mapping.caseType);

    matchingGroups.forEach(({ refAgency, caseType }) => {
      const key = `${refAgency}|${caseType}`;
      if (!displayData[key]) return;
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
 * Generate Disposition documents for a list of dockets in bulk.
 * Mirrors PHP bulkDispositionAutomation + dispositionAutomation logic exactly:
 *   1. Guard: skip if status is 'Closed' or 'Reconsideration'
 *   2. Fetch template from casetypedocuments via documents_automation (automation_type='decision')
 *   3. Fetch full docket details
 *   4. Generate PDF via EFS pipeline (same as single quick action)
 *   5. Insert documentstable + attachmentpaths records
 *   6. DELETE existing docketdisposition then INSERT new one
 *   7. UPDATE docket: status = 'Closed', closed_date = today
 *   8. INSERT docket_open_close_details (docket_status='closed')
 *   9. INSERT calendarhistory with disposition + closure details
 *  10. INSERT decision_automation_report (automation_flag='decision')
 *
 * @param {Array}  caseIds    - Selected docket case IDs
 * @param {Object} selections - { [agency|casetype]: automation_sub_type }
 * @param {string} [username] - Username of the logged-in user (for history ModifiedBy)
 * @returns {Promise<Object>} { success: [], failure: [], message: '' }
 */
async function processDispositionForDocket(docket, selections, username, userId) {
  const { caseId, refAgency, caseType, status } = docket;
  const groupKey = `${refAgency}|${caseType}`;
  const selection = selections[groupKey];
  // Selections are { automation_sub_type, documentId } from the dropdown; documentId picks
  // the exact template when two active templates share the same subtype label.
  const automationSubType = typeof selection === 'string' ? selection : selection?.automation_sub_type;
  const documentId = typeof selection === 'object' ? selection?.documentId : undefined;

  // Guard: failed or missing selection
  if (!automationSubType || automationSubType === 'failed') {
    return { caseId, error: 'No decision type selected for this case type' };
  }

  // Mirrors PHP bulkDispositionAutomation's party-count gate — the mail-merge letter template
  // can't be populated for a docket with no parties or with more than it has slots for.
  if (!(await isEligibleForBulkPartyCount(caseId))) {
    return { caseId, error: 'Docket has no parties, or too many parties (max 6), for bulk Disposition generation' };
  }

  // PHP guard: skip Closed or Reconsideration dockets
  if (status === 'Closed' || status === 'Reconsideration') {
    return { caseId, error: `Docket status '${status}' is not eligible for Disposition` };
  }

  const t = await mysqlSequelize.transaction();
  try {
    // Step 1: Get template document from casetypedocuments
    const templateDoc = documentId
      ? await getDispositionTemplateDocById(refAgency, caseType, documentId)
      : await getDispositionTemplateDoc(refAgency, caseType, automationSubType);
    if (!templateDoc) {
      throw new Error(`No Disposition template found for agency=${refAgency}, casetype=${caseType}, subtype=${automationSubType}`);
    }

    // Step 2: Fetch full docket details
    const fullDocket = await getDispositionDocketDetails(caseId);
    if (!fullDocket) {
      throw new Error(`Docket details not found for caseid=${caseId}`);
    }

    // Step 2.5: Fetch party types from DB, filter Minor/Children (mirrors PHP array_diff)
    const partyRows = await PeopleDetails.findAll({
      attributes: ['typeOfContact'],
      where: { caseId },
      raw: true,
    });
    const filteredParties = partyRows
      .map((r) => r.typeOfContact)
      .filter((pt) => pt && pt !== 'Minor/Children');
    logger.info(`Disposition parties for docket ${caseId}: ${filteredParties.join(', ')}`);

    // Step 3 & 4: Build merge data, generate PDF via EFS pipeline (same as single quick action)
    const mergeData = await buildNOHMergeData(caseId);
    const { attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveDispositionPdf(caseId, templateDoc, mergeData);

    // Step 5: Insert documentstable + attachmentpaths
    await saveDispositionDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);

    // Step 5.5: Insert "Quick Action: A Document template has been added." history
    //           Mirrors PHP generateDocumentTemplate history (line 1450, automationType='decision')
    await insertDispositionDocumentTemplateHistory(
      caseId, pdfFileName, templateDoc.documenttype || 'Decision', automationSubType, username, t,
    );

    // Step 6: Delete old docketdisposition + insert new one
    await upsertDocketDisposition(caseId, automationSubType, userId, t);

    // Step 7: Update docket status = 'Closed', set closed_date
    await closeDocket(caseId, t);

    // Step 8: Insert docket_open_close_details (docket_status='closed')
    await insertDocketOpenCloseDetails(caseId, userId, t);

    // Step 9: Insert history table entry (docket History tab)
    await insertDispositionDocketHistory(caseId, username, automationSubType, t, 'No');

    // Step 10: Insert decision_automation_report (bulk_designation_flag='1')
    await insertDispositionAutomationReport(fullDocket, automationSubType, t, '1');

    await t.commit();

    // Mirrors PHP: sendDocTemplateEmailNotification(flag='decision') — non-fatal, catches internally
    await sendDispositionEmailNotification(caseId, refAgency, caseType);

    // Mail vendor record — skip for ALS casetype + DDS or DPS agency (PHP MVAddFileCondition)
    const skipMailVendor = caseType === 'ALS' && ['DDS', 'DPS'].includes(refAgency);
    if (!skipMailVendor) {
      try {
        await saveMailVendorRecord(caseId, templateDoc.documenttype || 'Decision', pdfFileName, attachmentPath, null, userId, pdfBuffer);
      } catch (error) {
        logger.error(`Disposition mail vendor record failed for docket ${caseId}:`, error);
      }
    }

    logger.info(`Disposition (${automationSubType}) generated successfully for docket ${caseId}`);
    return { caseId, error: null };
  } catch (err) {
    await t.rollback();
    logger.error(`Disposition generation failed for docket ${caseId}:`, err);
    return { caseId, error: err.message };
  }
}

export const generateBulkDispositionHelper = async (caseIds, selections, username = '', userId = 0) => {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    throw new Error('No dockets selected for Disposition generation');
  }
  if (caseIds.length > MAX_BULK_LIMIT) {
    throw new Error(`Cannot process more than ${MAX_BULK_LIMIT} dockets at once`);
  }

  const dockets = await Docket.findAll({
    attributes: ['caseId', 'refAgency', 'caseType', 'status'],
    where: { caseId: { [Op.in]: caseIds } },
    raw: true,
  });

  const success = [];
  const failure = [];

  for (const docket of dockets) {
    const { caseId, error } = await processDispositionForDocket(docket, selections, username, userId);
    if (error) {
      failure.push({ caseid: caseId, reason: error });
    } else {
      success.push(caseId);
    }
  }

  return {
    success,
    failure,
    message: `Disposition processed: ${success.length} succeeded, ${failure.length} failed`,
  };
};
