import { mysqlSequelize } from '../../connections/seqDB.js';
import { logger } from '../../config/winstonLogger.js';
import Docket from '../models/Docket.js';
import Casetypes from '../models/Casetypes.js';
import {
  getNOHTemplateDoc,
  buildNOHMergeData,
  generateAndSaveNOHPdf,
  saveNOHDocumentRecord,
  updateDocketStatusForNOH,
  insertNOHAutomationReport,
} from '../services/nohDocumentService.js';
import { saveMailVendorRecord } from './docketQuickAction/mailVendorHelper.js';
import { insertNOHDocketHistory } from './docketQuickAction/nohDocketUpdateHelper.js';
import { copyToBulkMailFolders, copyToBulkdocsOnly, buildBulkMailFileName } from '../services/bulkUpload/bulkMailFolderService.js';

/**
 * Generate and attach a Notice of Hearing (NOH) document for a single docket.
 * Extracted from bulkDesignationHelper.generateBulkNOHHelper so the manual
 * bulk-designation flow and the CSV bulk-import automation flows (CSS EST,
 * OIG, DFCS, ...) share one implementation instead of drifting independently.
 * Mirrors PHP NOHAutomation(flag='1') end-to-end (template lookup, PDF generation,
 * docket/status update, history, decision_automation_report, mail vendor). No email —
 * legacy's flag='1' import path never sends one, for any agency.
 *
 * @param {number} caseId
 * @param {string} refAgency
 * @param {string} caseType
 * @param {string} automationSubType
 * @param {Object} [opts]
 * @param {string} [opts.username='']
 * @param {number} [opts.userId=0]
 * @param {string} [opts.bulkFlag='1'] - decision_automation_report bulk_designation_flag
 * @param {string} [opts.bulkMailBatchTimestamp] - when set, also copies the PDF into the
 *   shared Bulkdocs/Clerkdocs clerk-pickup folders under this batch's timestamp folder
 *   (mirrors PHP ExportBulkDoc::generateBulkDocuments()). Pass the same value for every
 *   docket in one CSV import batch so they land in the same folder, like legacy did.
 * @param {boolean} [opts.bulkMailIsRespondentCopy=false] - whether this letter's Bulkdocs
 *   filename should get the "_respondent" suffix (see buildBulkMailFileName).
 * @param {Array<{recipientIndex: number, isRespondentCopy?: boolean}>} [opts.bulkMailExtraCopies]
 *   - additional untracked recipient letters to drop into Bulkdocs only (never Clerkdocs, never
 *   attached to the docket) — mirrors legacy's per-recipient sk loop where every recipient gets
 *   a Bulkdocs copy but only sk===1 gets Clerkdocs + documentstable (ExportBulkDoc.php:857 vs.
 *   883-1019). E.g. OIG EBT's Respondent letter (sk=2) beyond the canonical Investigator (sk=1).
 * @param {boolean} [opts.enableMailVendorQueue=true] - legacy only queues into
 *   ecourt_mailvendor_documents for OIG/EBTFSF within ExportBulkDoc::generateBulkDocuments()
 *   (the CSV-import NOHAutomation(flag='1') path never reaches generateDocumentTemplate()'s own
 *   mail-vendor block at all). CSS EST import never queued anything in legacy — pass false there.
 * @returns {Promise<{success: boolean, caseId: number, reason?: string}>}
 */
export const generateNOHForDocket = async (caseId, refAgency, caseType, automationSubType, opts = {}) => {
  const {
    username = '', userId = 0, bulkFlag = '1', enableMailVendorQueue = true,
    bulkMailBatchTimestamp = null, bulkMailIsRespondentCopy = false, bulkMailExtraCopies = [],
  } = opts;
  const t = await mysqlSequelize.transaction();

  try {
    const templateDoc = await getNOHTemplateDoc(refAgency, caseType, automationSubType);
    if (!templateDoc) {
      throw new Error(`No NOH template found for agency=${refAgency}, casetype=${caseType}, subtype=${automationSubType}`);
    }

    const docketRow = await Docket.findOne({
      attributes: ['caseName', 'judge', 'judgeAssistant', 'hearingDate', 'hearingTime', 'dateReceivedByOSAH', 'refAgency', 'caseType'],
      where: { caseId },
      raw: true,
    });
    if (!docketRow) throw new Error(`Docket details not found for caseid=${caseId}`);

    const ctRow = await Casetypes.findOne({
      attributes: ['caseTypeId', 'agencyId'],
      where: { caseCode: docketRow.caseType, agencyCode: docketRow.refAgency },
      raw: true,
    });

    const fullDocket = {
      caseid: caseId,
      casename: docketRow.caseName,
      cma: docketRow.judgeAssistant,
      judge: docketRow.judge,
      newHearingDate: docketRow.hearingDate,
      newHearingTime: docketRow.hearingTime,
      getDateReceived: docketRow.dateReceivedByOSAH,
      casetypeid: ctRow?.caseTypeId,
      agencyId: ctRow?.agencyId,
    };

    const mergeData = await buildNOHMergeData(caseId);
    const { attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveNOHPdf(caseId, templateDoc, mergeData);

    await updateDocketStatusForNOH(caseId, t);
    await saveNOHDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);
    // Note: no "A Document template has been added." history entry here — legacy's CSV-import
    // NOHAutomation(flag='1') never calls generateDocumentTemplate() (the only place that inserts
    // it), so it never existed for CSS EST/OIG EBT imports. Only insertNOHDocketHistory below runs.
    await insertNOHDocketHistory(caseId, username, fullDocket.newHearingDate, fullDocket.newHearingTime, t);
    await insertNOHAutomationReport(fullDocket, automationSubType, t, bulkFlag);

    await t.commit();

    // Save mail vendor record after commit (non-fatal — cron picks up later for SFTP).
    if (enableMailVendorQueue) {
      try {
        await saveMailVendorRecord(caseId, templateDoc.documenttype, pdfFileName, attachmentPath, null, userId, pdfBuffer);
      } catch (error) {
        logger.error(`NOH mail vendor record failed for docket ${caseId}:`, error);
      }
    }

    // Mirrors PHP: ExportBulkDoc::generateBulkDocuments() Bulkdocs/Clerkdocs folder-drop for
    // manual clerk pickup. Non-fatal — the document is already attached and mail-vendor-queued.
    if (bulkMailBatchTimestamp) {
      try {
        const clerkdocsFileName = buildBulkMailFileName(caseId, templateDoc.documentname, bulkMailBatchTimestamp);
        const bulkdocsFileName = buildBulkMailFileName(
          caseId, templateDoc.documentname, bulkMailBatchTimestamp, { isRespondentCopy: bulkMailIsRespondentCopy },
        );
        copyToBulkMailFolders(pdfBuffer, bulkMailBatchTimestamp, { bulkdocsFileName, clerkdocsFileName });

        // Extra untracked recipient letters (e.g. OIG EBT's Respondent copy) — Bulkdocs only.
        for (const { recipientIndex, isRespondentCopy } of bulkMailExtraCopies) {
          const extraFileName = buildBulkMailFileName(
            caseId, templateDoc.documentname, bulkMailBatchTimestamp, { recipientIndex, isRespondentCopy },
          );
          copyToBulkdocsOnly(pdfBuffer, extraFileName, bulkMailBatchTimestamp);
        }
      } catch (error) {
        logger.error(`NOH bulk-mail folder copy failed for docket ${caseId}:`, error);
      }
    }

    // Note: no email notification here — legacy's CSV-import NOHAutomation(flag='1') requires
    // flag!='1' before it will send sendDocTemplateEmailNotification (or the DFCS-M-specific
    // sendElectronicMail), so CSS EST/OIG EBT imports never emailed anyone, for any agency.

    logger.info(`NOH (${automationSubType}) generated successfully for docket ${caseId}`);
    return { success: true, caseId };
  } catch (err) {
    // t may already be committed if a post-commit step (e.g. a future addition without its own
    // try/catch) throws here — rolling back a finished transaction throws its own error and would
    // mask the original one.
    if (!t.finished) await t.rollback();
    logger.error(`NOH generation failed for docket ${caseId}:`, err);
    return { success: false, caseId, reason: err.message };
  }
};
