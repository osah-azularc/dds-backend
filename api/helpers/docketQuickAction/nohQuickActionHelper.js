/*
  Created by  : Snehal Narkar
  Date        : 2026-05-28
  Description : Single-docket NOH Quick Action helper.
                Mirrors PHP NOHAutomation($db, $param, $flag=0) in OsahDbDocumentTemplate.php.
                Designed to be reusable — can be called from any controller or service that needs
                to generate a single NOH document for a docket.
*/

import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';
import {
  getNOHTemplateDoc,
  buildNOHMergeData,
  generateAndSaveNOHPdf,
  saveNOHDocumentRecord,
  insertNOHDocumentTemplateHistory,
  insertNOHAutomationReport,
} from '../../services/nohDocumentService.js';
import { saveMailVendorRecord } from './mailVendorHelper.js';
import {
  updateDocketForNOH,
  insertNOHDocketHistory,
} from './nohDocketUpdateHelper.js';
import { sendNOHDocEmailNotification } from './quickActionEmailNotificationHelper.js';
import { sendDFCSMedicalHearingEmail } from './dfcsMedicalHearingEmailHelper.js';
import { createDocumentAddedNotification } from '../notification/documentAddedNotificationHelper.js';

/**
 * Generate a single NOH document for one docket.
 * Mirrors PHP NOHAutomation with flag=0 exactly:
 *   1. Look up template via documents_automation (automation_type='noh')
 *   2. Filter 'Minor/Children' from allParties
 *   3. Build DOCX merge data from params
 *   4. Generate PDF and upload to S3
 *   5. In a transaction:
 *      a. Update docket: hearingdate, hearingtime, status='Hearing Scheduled'
 *      b. Insert documentstable + attachmentpaths
 *      c. Insert history table entry (docket history tab)
 *      d. Insert calendarhistory entry
 *      e. Insert decision_automation_report (bulk_designation_flag='0')
 *   6. Send document email notifications (non-fatal, after commit)
 *
 * @param {Object} params
 * @param {string} params.agencyCode        - Agency code (e.g. 'DDS')
 * @param {string} params.casetype          - Case type code (e.g. 'ALS')
 * @param {string} params.automationSubType - NOH sub-type (e.g. 'In Person Hearing')
 * @param {number} params.caseId            - Docket case ID
 * @param {string[]} params.allParties      - Party types to include (e.g. ['Petitioner'])
 * @param {string} params.caseName          - Case name
 * @param {number|string} params.agencyId   - Agency primary key
 * @param {number|string} params.caseTypeId - Case type primary key
 * @param {string} params.newHearingDate    - New hearing date (YYYY-MM-DD)
 * @param {string} params.newHearingTime    - New hearing time (HH:mm:ss)
 * @param {string} params.getDateReceived   - Date case was received (YYYY-MM-DD)
 * @param {string} params.judge             - Judge full name
 * @param {string} params.cma               - CMA (judge assistant) full name
 * @param {string} username                 - Logged-in user's display name (for history)
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const generateNOH = async (params, username, userId = 0) => {
  const {
    agencyCode,
    casetype,
    automationSubType,
    caseId,
    allParties,
    caseName,
    agencyId,
    caseTypeId,
    newHearingDate,
    newHearingTime,
    getDateReceived,
    judge,
    cma,
  } = params;

  // Step 1: Look up the NOH template document
  const templateDoc = await getNOHTemplateDoc(agencyCode, casetype, automationSubType);
  if (!templateDoc) {
    logger.error(`[NOHQuickAction] No NOH template found for agency=${agencyCode}, casetype=${casetype}, subtype=${automationSubType}`);
    return { success: false, message: 'NOH document could not be generated. Please try again.' };
  }

  // Step 2: Filter 'Minor/Children' from party types (mirrors PHP array_diff)
  const filteredParties = (allParties || []).filter((p) => p !== 'Minor/Children');
  logger.info(`[NOHQuickAction] Generating NOH for caseId=${caseId}, subtype=${automationSubType}, parties=${filteredParties.join(',')}`);

  // Step 3: Build merge data via the dynamic resolver system
  const mergeData = await buildNOHMergeData(caseId, { hearingDate: newHearingDate, hearingTime: newHearingTime });

  // Step 4: Generate PDF and save to EFS (mirrors PHP — no S3 for NOH documents)
  let attachmentPath, pdfFileName, pdfBuffer;
  try {
    ({ attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveNOHPdf(caseId, templateDoc, mergeData));
  } catch (error_) {
    logger.error(`[NOHQuickAction] PDF generation failed for caseId=${caseId}:`, error_);
    return { success: false, message: 'NOH document could not be generated. Please try again.' };
  }

  // Step 5: All DB writes in a single transaction
  const t = await mysqlSequelize.transaction();
  let documentId;
  try {
    // 5a: Update docket hearingdate, hearingtime, status='Hearing Scheduled'
    await updateDocketForNOH(caseId, newHearingDate, newHearingTime, t);

    // 5b: Insert documentstable + attachmentpaths
    documentId = await saveNOHDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);

    // 5b.5: Insert "Quick Action: A Document template has been added." history
    //       Mirrors PHP generateDocumentTemplate history (line 1450, automationType='noh')
    await insertNOHDocumentTemplateHistory(
      caseId, pdfFileName, templateDoc.documenttype || 'NOH', automationSubType, username, t,
    );

    // 5c: Insert docket history entry (history table — shown in docket History tab)
    //     Mirrors PHP addHistory($db, $historyData, "history")
    await insertNOHDocketHistory(caseId, username, newHearingDate, newHearingTime, t);

    // 5d: Insert decision_automation_report (bulk_designation_flag='0' for single quick action)
    await insertNOHAutomationReport(
      {
        caseid: caseId,
        casename: caseName,
        cma,
        judge,
        agencyId,
        casetypeid: caseTypeId,
        newHearingDate,
        getDateReceived,
      },
      automationSubType,
      t,
      '0',
    );

    await t.commit();
    logger.info(`[NOHQuickAction] NOH generated successfully for caseId=${caseId}`);
  } catch (err) {
    await t.rollback();
    logger.error(`[NOHQuickAction] DB writes failed for caseId=${caseId}:`, err);
    return { success: false, message: 'NOH document could not be generated. Please try again.' };
  }

  // Step 6: Save mail vendor record (non-fatal — cron picks this up later for SFTP to print vendor)
  //         Mirrors PHP: ecourt_mailvendor_documents insert in generateDocumentTemplate (flag="1").
  //         cmaId passed as null — we have the CMA name but not publicaccess_users.user_id here.
  try {
    await saveMailVendorRecord(caseId, templateDoc.documenttype, pdfFileName, attachmentPath, null, userId, pdfBuffer);
  } catch (error) {
    logger.error(`[NOHQuickAction] Mail vendor record save failed for caseId=${caseId}:`, error);
  }

  // Step 7: Send email notifications after commit (non-fatal — mirrors PHP conditional email send)
  //         Mirrors PHP: sendDocTemplateEmailNotification with flag='noh'
  //         Skips for DFCS (plain), CSS, EST casetype — handled inside the helper.
  await sendNOHDocEmailNotification(caseId, agencyCode, casetype);

  // Step 7.5: Bell notification for docket followers ("Notify Me") — Document Templates
  //           trigger. Non-fatal: createDocumentAddedNotification swallows its own errors.
  await createDocumentAddedNotification({
    caseId,
    docId: documentId,
    documentType: templateDoc.documenttype || 'NOH',
    actorUserId: userId,
  });

  // Step 8: DFCS-M medical hearing notice (non-fatal — mirrors PHP sendElectronicMail call)
  //         Sent only for DFCS-M agency; goes to Petitioner / Petitioner Attorney / Representative.
  if (String(agencyCode).toUpperCase() === 'DFCS-M') {
    await sendDFCSMedicalHearingEmail(caseId, newHearingDate, newHearingTime, username);
  }

  return { success: true, message: 'NOH generated successfully.' };
};
