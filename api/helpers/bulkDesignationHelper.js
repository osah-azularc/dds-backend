import { mysqlSequelize } from '../../connections/seqDB.js'; // used for transactions
import { Op } from 'sequelize';
import { logger } from '../../config/winstonLogger.js';
import Docket from '../models/Docket.js';
import Casetypes from '../models/Casetypes.js';
import { getMatchedCasetypeMappings, getMappingAutomations } from '../services/documentTemplateMappingService.js';
import {
  getNOHTemplateDoc,
  getNOHTemplateDocById,
  buildNOHMergeData,
  generateAndSaveNOHPdf,
  saveNOHDocumentRecord,
  insertNOHDocumentTemplateHistory,
  updateDocketStatusForNOH,
  insertNOHAutomationReport,
} from '../services/nohDocumentService.js';
import { saveMailVendorRecord } from './docketQuickAction/mailVendorHelper.js';
import { insertNOHDocketHistory } from './docketQuickAction/nohDocketUpdateHelper.js';
import { sendNOHDocEmailNotification } from './docketQuickAction/quickActionEmailNotificationHelper.js';
import { sendDFCSMedicalHearingEmail } from './docketQuickAction/dfcsMedicalHearingEmailHelper.js';
import { isEligibleForBulkPartyCount } from './docketDetail/partyDetailsHelper.js';
// Note: bulk NOH uses updateDocketStatusForNOH (status only); single NOH uses updateDocketForNOH (date+time+status).

const MAX_BULK_NOH_LIMIT = 100;

/**
 * Get grouped NOH display data for selected dockets.
 * Groups by agency|casetype and returns available NOH sub-types per group.
 * Groups with no supported templates are included with an empty data array.
 *
 * @param {Array<string|number>} caseIds - Selected docket case IDs
 * @returns {Promise<Object>} displayData keyed by "agency|casetype"
 */
export const getNOHDropdownDataHelper = async (caseIds) => {
  try {
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

    // Initialise all groups as unavailable; promote to available when a template is found.
    const displayData = {};
    docketGroups.forEach(({ refAgency, caseType }) => {
      displayData[`${refAgency}|${caseType}`] = { data: [], available: false };
    });

    if (docketGroups.length === 0) return displayData;

    // Step 2: Fetch CaseTypeDocuments for all relevant (agency, caseType) pairs. Exact
    // agency+casetype match only — mirrors legacy's documentTypesInBulkAction (flag=2) and
    // bulkEditNOHAutomation, both of which join on the docket's own agency/casetype with no
    // DFCS-M cross-agency substitution, same as the Continuance/Disposition dropdown helpers.
    const uniqueAgencies = [...new Set(docketGroups.map((g) => g.refAgency))];
    const uniqueCaseTypes = [...new Set(docketGroups.map((g) => g.caseType))];
    const validPairs = new Set(docketGroups.map((g) => `${g.refAgency}|${g.caseType}`));

    const mappings = await getMatchedCasetypeMappings(uniqueAgencies, uniqueCaseTypes);
    const matchedCtDocs = mappings.filter((m) => m.isAllCasetypes === 1 || validPairs.has(`${m.agency}|${m.caseType}`));
    const matchedDocIds = matchedCtDocs.map((d) => d.id);

    if (matchedDocIds.length === 0) return displayData;

    // Step 3: Fetch automation rows for those mapping IDs.
    const rawAutomations = await getMappingAutomations(matchedDocIds, 'noh');
    const automations = rawAutomations.map((a) => ({ mappingId: a.mappingId, templateId: a.templateId, automationSubType: a.automationSubType }));

    // Step 4: Reverse-map mappingId → its mapping row (isAllCasetypes wildcard rows apply
    // to every caseType under the same agency).
    const docIdToMapping = {};
    matchedCtDocs.forEach((d) => { docIdToMapping[d.id] = d; });

    const seenTemplates = new Set();
    automations.forEach(({ mappingId, templateId, automationSubType }) => {
      const mapping = docIdToMapping[mappingId];
      if (!mapping) return;

      // A single wildcard (isAllCasetypes) mapping can legitimately own more than one selected
      // docket group at once — use filter, not find, or it only ever gets attributed to
      // whichever group happens to come first in docketGroups, leaving other equally-eligible
      // groups marked unavailable.
      const matchingGroups = docketGroups.filter((g) => {
        if (g.refAgency !== mapping.agency) return false;
        return mapping.isAllCasetypes === 1 || g.caseType === mapping.caseType;
      });

      matchingGroups.forEach((group) => {
        const key = `${group.refAgency}|${group.caseType}`;
        // Dedupe on the template, not the subtype label — two different active templates can
        // share the same automationSubType text and must both stay individually selectable.
        const dedupeKey = `${key}|${templateId}`;
        if (seenTemplates.has(dedupeKey)) return;
        seenTemplates.add(dedupeKey);

        displayData[key].available = true;
        displayData[key].data.push({ automation_sub_type: automationSubType, documentId: templateId });
      });
    });

    return displayData;
  } catch (error) {
    logger.error('Error getting NOH dropdown data:', error);
    throw error;
  }
};

/**
 * Fetch docket details needed for NOH generation for a list of case IDs.
 * @param {Array} docketIds - Array of case IDs
 * @returns {Promise<Array>} - Array of docket records
 */
export const getDocketDetailsForNOH = async (docketIds) => {
  try {
    return await Docket.findAll({
      attributes: ['caseId', 'refAgency', 'caseType'],
      where: { caseId: { [Op.in]: docketIds } },
      raw: true,
    });
  } catch (error) {
    logger.error('Error fetching docket details for NOH:', error);
    throw error;
  }
};

/**
 * Generate NOH for a list of dockets in bulk.
 * Mirrors PHP bulkEditNOHAutomation + NOHAutomation logic exactly:
 *   1. Fetch template from casetypedocuments via documents_automation
 *   2. Fetch full docket details (judge, cma, hearing date/time, etc.)
 *   3. Generate PDF from DOCX template (merge fields + libreoffice convert)
 *   4. Upload PDF to S3
 *   5. Update docket status → 'Hearing Scheduled'
 *   6. Insert documentstable + attachmentpaths records
 *   7. Insert calendarhistory entry
 *   8. Insert decision_automation_report entry
 *
 * @param {Array}  caseIds    - Selected docket case IDs
 * @param {Object} selections - { [agency|casetype]: automation_sub_type }
 * @param {string} [username] - Username of the logged-in user (for history)
 * @returns {Promise<Object>} - { success: [], failure: [], message: '' }
 */
export const generateBulkNOHHelper = async (caseIds, selections, username = '', userId = 0) => {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    throw new Error('No dockets selected for NOH generation');
  }
  if (caseIds.length > MAX_BULK_NOH_LIMIT) {
    throw new Error(`Cannot process more than ${MAX_BULK_NOH_LIMIT} dockets at once`);
  }

  const dockets = await getDocketDetailsForNOH(caseIds);
  const success = [];
  const failure = [];

  for (const docket of dockets) {
    const { caseId, refAgency, caseType } = docket;
    const groupKey = `${refAgency}|${caseType}`;
    const selection = selections[groupKey];
    // Selections are { automation_sub_type, documentId } from the dropdown; documentId picks
    // the exact template when two active templates share the same subtype label.
    const automationSubType = typeof selection === 'string' ? selection : selection?.automation_sub_type;
    const documentId = typeof selection === 'object' ? selection?.documentId : undefined;

    if (!automationSubType) {
      failure.push({ caseid: caseId, reason: 'No NOH type selected for this case type' });
      continue;
    }

    // Mirrors PHP bulkEditNOHAutomation's party-count gate — the mail-merge letter template
    // can't be populated for a docket with no parties or with more than it has slots for.
    if (!(await isEligibleForBulkPartyCount(caseId))) {
      failure.push({ caseid: caseId, reason: 'Docket has no parties, or too many parties (max 6), for bulk NOH generation' });
      continue;
    }

    const t = await mysqlSequelize.transaction();
    try {
      // Step 1: Get template document from casetypedocuments
      const templateDoc = documentId
        ? await getNOHTemplateDocById(refAgency, caseType, documentId)
        : await getNOHTemplateDoc(refAgency, caseType, automationSubType);
      if (!templateDoc) {
        throw new Error(`No NOH template found for agency=${refAgency}, casetype=${caseType}, subtype=${automationSubType}`);
      }

      // Step 2: Fetch minimal docket fields needed for history/report records
      const docketRow = await Docket.findOne({
        attributes: ['caseName', 'judge', 'judgeAssistant', 'hearingSite', 'hearingDate', 'hearingTime', 'dateReceivedByOSAH', 'refAgency', 'caseType'],
        where: { caseId },
        raw: true,
      });
      if (!docketRow) throw new Error(`Docket details not found for caseid=${caseId}`);

      // Mirrors PHP bulkEditNOHAutomation's gate before calling NOHAutomation() — judge, cma,
      // hearing site, hearing date, and hearing time must all be set, or the NOH is not generated
      // (legacy records it as a failure rather than merging blank fields into the document).
      if (!docketRow.judge || !docketRow.judgeAssistant || !docketRow.hearingSite || !docketRow.hearingDate || !docketRow.hearingTime) {
        throw new Error(`Docket ${caseId} is missing required hearing details (judge, CMA, hearing site, hearing date, and hearing time are all required) — NOH not generated`);
      }

      const ctRow = await Casetypes.findOne({
        attributes: ['caseTypeId', 'agencyId'],
        where: { caseCode: docketRow.caseType, agencyCode: docketRow.refAgency },
        raw: true,
      });
      const fullDocket = {
        caseid:          caseId,
        casename:        docketRow.caseName,
        cma:             docketRow.judgeAssistant,
        judge:           docketRow.judge,
        newHearingDate:  docketRow.hearingDate,
        newHearingTime:  docketRow.hearingTime,
        getDateReceived: docketRow.dateReceivedByOSAH,
        casetypeid:      ctRow?.caseTypeId,
        agencyId:        ctRow?.agencyId,
      };

      // Step 3 & 4: Build merge data, generate PDF, upload to S3
      const mergeData = await buildNOHMergeData(caseId);
      const { attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveNOHPdf(caseId, templateDoc, mergeData);

      // Step 5: Update docket status → 'Hearing Scheduled'
      await updateDocketStatusForNOH(caseId, t);

      // Step 6: Insert documentstable + attachmentpaths
      await saveNOHDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);

      // Step 6.5: Insert "Quick Action: A Document template has been added." history
      //           Mirrors PHP generateDocumentTemplate history (line 1450, automationType='noh')
      await insertNOHDocumentTemplateHistory(
        caseId, pdfFileName, templateDoc.documenttype || 'NOH', automationSubType, username, t,
      );

      // Step 7: Insert docket history entry (history tab)
      await insertNOHDocketHistory(caseId, username, fullDocket.newHearingDate, fullDocket.newHearingTime, t);

      // Step 8: Insert decision_automation_report (bulk_designation_flag = '1')
      await insertNOHAutomationReport(fullDocket, automationSubType, t, '1');

      await t.commit();

      // Save mail vendor record after commit (non-fatal — cron picks up later for SFTP)
      try {
        await saveMailVendorRecord(caseId, templateDoc.documenttype, pdfFileName, attachmentPath, null, userId, pdfBuffer);
      } catch (error) {
        logger.error(`NOH mail vendor record failed for docket ${caseId}:`, error);
      }

      // Mirrors PHP: sendDocTemplateEmailNotification(flag='noh') — non-fatal, catches internally
      await sendNOHDocEmailNotification(caseId, refAgency, caseType);

      // Mirrors PHP: sendElectronicMail for DFCS-M — non-fatal, catches internally
      if (String(refAgency).toUpperCase() === 'DFCS-M') {
        await sendDFCSMedicalHearingEmail(caseId, fullDocket.newHearingDate, fullDocket.newHearingTime, username);
      }

      logger.info(`NOH (${automationSubType}) generated successfully for docket ${caseId}`);
      success.push(caseId);
    } catch (err) {
      await t.rollback();
      logger.error(`NOH generation failed for docket ${caseId}:`, err);
      failure.push({ caseid: caseId, reason: err.message });
    }
  }

  return {
    success,
    failure,
    message: `NOH processed: ${success.length} succeeded, ${failure.length} failed`,
  };
};
