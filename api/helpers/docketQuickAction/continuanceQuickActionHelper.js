/*
  Created by  : Snehal Narkar
  Date        : 2026-06-11
  Description : Single-docket Continuance Quick Action helper.
                Mirrors PHP continuanceAutomation($db, $param, $flag=0) in OsahDbDocumentTemplate.php.
                Reuses the same EFS + dynamic merge field pipeline as the NOH quick action.
*/

import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';
import { buildNOHMergeData } from '../../services/nohDocumentService.js';
import {
  getContinuanceTemplateDoc,
  getContinuanceDocketDetails,
  generateAndSaveContinuancePdf,
  saveContinuanceDocumentRecord,
  updateDocketForContinuance,
  insertDocumentTemplateAddedHistory,
  insertContinuanceDocketHistory,
  insertContinuanceAutomationReport,
  updateCheckinCalendarForContinuance,
} from '../../services/continuanceDocumentService.js';
import { saveMailVendorRecord } from './mailVendorHelper.js';
import { sendContinuanceEmailNotification } from './quickActionEmailNotificationHelper.js';
import { createDocumentAddedNotification } from '../notification/documentAddedNotificationHelper.js';

/**
 * Generate a single Continuance document for one docket.
 * Mirrors PHP continuanceAutomation with flag=0 exactly:
 *
 *  1. Capture current hearing date/time BEFORE any update (past_hearing_date)
 *  2. Look up template via documents_automation (automation_type='continuance')
 *  3. Filter 'Minor/Children' from allParties
 *  4. Build DOCX merge data from the dynamic catalog system
 *  5. UPDATE docket: hearingdate, hearingtime, status='Rescheduled'  ← PHP does this FIRST
 *  6. Generate PDF and save to EFS (reads updated docket from DB)
 *  7. In a transaction:
 *      a. Insert documentstable + attachmentpaths
 *      b. Insert history "Quick Action: A Document template has been added."
 *      c. Insert history "Quick Action: Osah form has been updated: Hearing Date/Time"
 *      d. Insert calendarhistory entry
 *      e. Insert decision_automation_report (bulk_designation_flag='0')
 *  8. Save mail vendor record (non-fatal)
 *  9. Send email notifications (non-fatal)
 * 10. Check-in feature: if old hearing date was today, upsert checkin_calendar_today_date (non-fatal)
 *
 * @param {Object} params
 * @param {string} params.agencyCode
 * @param {string} params.casetype
 * @param {string} params.automationSubType
 * @param {number} params.caseId
 * @param {string[]} params.allParties
 * @param {string} params.caseName
 * @param {number|string} params.agencyId
 * @param {number|string} params.caseTypeId
 * @param {string} params.newHearingDate    YYYY-MM-DD
 * @param {string} params.newHearingTime    HH:mm or HH:mm:ss
 * @param {string} params.getDateReceived   YYYY-MM-DD
 * @param {string} params.judge
 * @param {string} params.cma
 * @param {string} username
 * @param {number} [userId=0]
 *
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const generateContinuance = async (params, username, userId = 0) => {
  const {
    agencyCode, casetype, automationSubType, caseId,
    allParties, caseName, agencyId, caseTypeId,
    newHearingDate, newHearingTime, getDateReceived, judge, cma,
    startCheckinFeature = 'No',
  } = params;

  // Step 1: Capture current hearing date/time BEFORE any update (mirrors PHP's first SELECT)
  const fullDocket = await getContinuanceDocketDetails(caseId);
  if (!fullDocket) {
    logger.error(`[ContinuanceQuickAction] Docket not found for caseId=${caseId}`);
    return { success: false, message: 'Continuance document could not be generated. Docket not found.' };
  }
  const pastHearingDate = fullDocket.currentHearingDate || null;
  const pastHearingTime = fullDocket.currentHearingTime || null;

  // Step 2: Look up the Continuance template document
  const templateDoc = await getContinuanceTemplateDoc(agencyCode, casetype, automationSubType);
  if (!templateDoc) {
    logger.error(`[ContinuanceQuickAction] No Continuance template found for agency=${agencyCode}, casetype=${casetype}, subtype=${automationSubType}`);
    return { success: false, message: 'Continuance document could not be generated. Please try again.' };
  }

  // Step 3: Filter 'Minor/Children' from party types (mirrors PHP array_diff)
  const filteredParties = (allParties || []).filter((p) => p !== 'Minor/Children');
  logger.info(`[ContinuanceQuickAction] Generating for caseId=${caseId}, subtype=${automationSubType}, parties=${filteredParties.join(',')}`);

  // Step 4: Build merge data via the dynamic catalog system
  const mergeData = await buildNOHMergeData(caseId, { hearingDate: newHearingDate, hearingTime: newHearingTime });

  // Step 5: UPDATE docket FIRST — mirrors PHP which updates before calling generateDocumentTemplate
  //         This means the PDF generation in step 6 reads the new date/time directly from the DB.
  try {
    await updateDocketForContinuance(caseId, newHearingDate, newHearingTime);
  } catch (error_) {
    logger.error(`[ContinuanceQuickAction] Docket update failed for caseId=${caseId}:`, error_);
    return { success: false, message: 'Continuance document could not be generated. Please try again.' };
  }

  // Step 6: Generate PDF and save to EFS
  let attachmentPath, pdfFileName, pdfBuffer;
  try {
    ({ attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveContinuancePdf(caseId, templateDoc, mergeData));
  } catch (error_) {
    logger.error(`[ContinuanceQuickAction] PDF generation failed for caseId=${caseId}:`, error_);
    return { success: false, message: 'Continuance document could not be generated. Please try again.' };
  }

  // Step 7: All remaining DB writes in a single transaction
  const t = await mysqlSequelize.transaction();
  let documentId;
  try {
    // 7a: Insert documentstable + attachmentpaths
    documentId = await saveContinuanceDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);

    // 7b: Insert "Quick Action: A Document template has been added." history
    //     Mirrors PHP generateDocumentTemplate history insert (lines 1446-1459)
    await insertDocumentTemplateAddedHistory(
      caseId, pdfFileName, templateDoc.documenttype || 'Continuance', automationSubType, username, t,
    );

    // 7c: Insert "Quick Action: Osah form has been updated: Hearing Date/Time" history
    //     Mirrors PHP continuanceAutomation addHistory call (line 1871)
    await insertContinuanceDocketHistory(caseId, username, newHearingDate, newHearingTime, t, startCheckinFeature);

    // 7d: Insert decision_automation_report (bulk_designation_flag='0' for single quick action)
    const reportDocket = { caseid: caseId, casename: caseName, cma, judge, agencyId, casetypeid: caseTypeId, getDateReceived };
    await insertContinuanceAutomationReport(reportDocket, automationSubType, newHearingDate, pastHearingDate, t, '0');

    await t.commit();
    logger.info(`[ContinuanceQuickAction] Continuance generated successfully for caseId=${caseId}`);
  } catch (err) {
    await t.rollback();
    logger.error(`[ContinuanceQuickAction] DB writes failed for caseId=${caseId}:`, err);
    return { success: false, message: 'Continuance document could not be generated. Please try again.' };
  }

  // Step 8: Save mail vendor record (non-fatal — cron picks this up for SFTP to print vendor)
  try {
    await saveMailVendorRecord(caseId, templateDoc.documenttype, pdfFileName, attachmentPath, null, userId, pdfBuffer);
  } catch (error) {
    logger.error(`[ContinuanceQuickAction] Mail vendor record save failed for caseId=${caseId}:`, error);
  }

  // Step 9: Send email notifications (non-fatal)
  //         Mirrors PHP: sendDocTemplateEmailNotification(flag='continuance')
  await sendContinuanceEmailNotification(caseId, agencyCode, casetype);

  // Step 9.5: Bell notification for docket followers ("Notify Me") — Document Templates
  //           trigger. Non-fatal: createDocumentAddedNotification swallows its own errors.
  await createDocumentAddedNotification({
    caseId,
    docId: documentId,
    documentType: templateDoc.documenttype || 'Continuance',
    actorUserId: userId,
  });

  // Step 10: Check-in feature (non-fatal)
  //          Mirrors PHP: if (currentHearingDate == today) updateDocketStatusToStartCheckinDocket(...)
  try {
    await updateCheckinCalendarForContinuance(caseId, pastHearingDate, pastHearingTime, userId);
  } catch (error) {
    logger.error(`[ContinuanceQuickAction] Check-in calendar update failed for caseId=${caseId}:`, error);
  }

  return { success: true, message: 'Continuance generated successfully.' };
};
