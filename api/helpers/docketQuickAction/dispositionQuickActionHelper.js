/*
  Description : Single-docket Disposition Quick Action helper.
                Mirrors PHP dispositionAutomation($db, $param, $flag=0) in OsahDbDocumentTemplate.php.
*/

import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';
import { buildNOHMergeData } from '../../services/nohDocumentService.js';
import {
  getDispositionTemplateDoc,
  getDispositionDocketDetails,
  generateAndSaveDispositionPdf,
  saveDispositionDocumentRecord,
  insertDispositionDocumentTemplateHistory,
  upsertDocketDisposition,
  closeDocket,
  insertDocketOpenCloseDetails,
  insertDispositionDocketHistory,
  insertDispositionAutomationReport,
} from '../../services/dispositionDocumentService.js';
import { sendDispositionEmailNotification } from './quickActionEmailNotificationHelper.js';
import { updateCheckinCalendarForContinuance as updateCheckinCalendar } from '../../services/continuanceDocumentService.js';
import { saveMailVendorRecord } from './mailVendorHelper.js';
import { createDocumentAddedNotification } from '../notification/documentAddedNotificationHelper.js';

/**
 * Generate a single Disposition (Decision) document for one docket.
 * Mirrors PHP dispositionAutomation with flag=0:
 *  1. Fetch full docket details (captures current hearing date for check-in feature)
 *  2. Look up template via documents_automation (automationType='decision')
 *  3. Build merge data via the shared context builder pipeline
 *  4. Generate PDF and save to EFS
 *  5. In a transaction:
 *     a. Insert documentstable + attachmentpaths
 *     b. Delete + insert docketdisposition record
 *     c. Update docket: status='Closed', closed_date=today
 *     d. Insert docket_open_close_details
 *     e. Insert history table entry (docket History tab)
 *     f. Insert decision_automation_report (bulk_designation_flag='0')
 *  6. Send email notifications (non-fatal)
 *  7. Check-in feature: if hearing date is today, upsert checkin_calendar_today_date (non-fatal)
 */
export const generateDisposition = async (params, username, userId = 0) => {
  const {
    agencyCode, casetype, automationSubType, caseId,
    caseName, agencyId, caseTypeId, getDateReceived, judge, cma, allParties,
    startCheckinFeature = 'No',
  } = params;

  // Mirrors PHP: array_diff($param['data']['allParties'], ['Minor/Children'])
  const filteredParties = (allParties || []).filter((p) => p !== 'Minor/Children');
  logger.info(`[DispositionQuickAction] Parties for caseId=${caseId}: ${filteredParties.join(', ')}`);

  // Step 1: Fetch docket details (captures hearingDate before we close the case)
  const fullDocket = await getDispositionDocketDetails(caseId);
  if (!fullDocket) {
    logger.error(`[DispositionQuickAction] Docket not found for caseId=${caseId}`);
    return { success: false, message: 'Disposition document could not be generated. Docket not found.' };
  }
  const hearingDate = fullDocket.getHearingDate || null;
  const hearingTime = fullDocket.hearingTime || null;

  // Step 2: Look up the Disposition template document
  const templateDoc = await getDispositionTemplateDoc(agencyCode, casetype, automationSubType);
  if (!templateDoc) {
    logger.error(`[DispositionQuickAction] No template found for agency=${agencyCode}, casetype=${casetype}, subtype=${automationSubType}`);
    return { success: false, message: 'Disposition document could not be generated. Please try again.' };
  }

  logger.info(`[DispositionQuickAction] Generating for caseId=${caseId}, subtype=${automationSubType}`);

  // Step 3: Build merge data via the shared context builder
  const mergeData = await buildNOHMergeData(caseId);

  // Step 4: Generate PDF and save to EFS
  let attachmentPath, pdfFileName, pdfBuffer;
  try {
    ({ attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveDispositionPdf(caseId, templateDoc, mergeData));
  } catch (error_) {
    logger.error(`[DispositionQuickAction] PDF generation failed for caseId=${caseId}:`, error_);
    return { success: false, message: 'Disposition document could not be generated. Please try again.' };
  }

  // Step 5: All DB writes in a single transaction
  const t = await mysqlSequelize.transaction();
  let documentId;
  try {
    // 5a: Insert documentstable + attachmentpaths
    documentId = await saveDispositionDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, t);

    // 5a.5: Insert "Quick Action: A Document template has been added." history
    //       Mirrors PHP generateDocumentTemplate history (line 1450, automationType='decision')
    await insertDispositionDocumentTemplateHistory(
      caseId, pdfFileName, templateDoc.documenttype || 'Decision', automationSubType, username, t,
    );

    // 5b: Delete existing docketdisposition + insert new one
    await upsertDocketDisposition(caseId, automationSubType, userId, t);

    // 5c: Update docket status = 'Closed', closed_date = today
    await closeDocket(caseId, t);

    // 5d: Insert docket_open_close_details
    await insertDocketOpenCloseDetails(caseId, userId, t);

    // 5e: Insert history entry (docket History tab)
    await insertDispositionDocketHistory(caseId, username, automationSubType, t, startCheckinFeature);

    // 5f: Insert decision_automation_report (bulk_designation_flag='0' for single)
    const reportDocket = {
      caseid: caseId, casename: caseName, cma: cma || fullDocket.cma,
      judge: judge || fullDocket.judge, agencyId, casetypeid: caseTypeId,
      getHearingDate: hearingDate, getDateReceived,
    };
    await insertDispositionAutomationReport(reportDocket, automationSubType, t, '0');

    await t.commit();
    logger.info(`[DispositionQuickAction] Disposition generated successfully for caseId=${caseId}`);
  } catch (err) {
    await t.rollback();
    logger.error(`[DispositionQuickAction] DB writes failed for caseId=${caseId}:`, err);
    return { success: false, message: 'Disposition document could not be generated. Please try again.' };
  }

  // Step 6: Send email notifications (non-fatal — catches internally)
  await sendDispositionEmailNotification(caseId, agencyCode, casetype);

  // Step 6.25: Bell notification for docket followers ("Notify Me") — Document Templates
  //            trigger. Non-fatal: createDocumentAddedNotification swallows its own errors.
  await createDocumentAddedNotification({
    caseId,
    docId: documentId,
    documentType: templateDoc.documenttype || 'Decision',
    actorUserId: userId,
  });

  // Step 6.5: Save mail vendor record (non-fatal — mirrors PHP generateDocumentTemplate MVAddFileCondition).
  //            Skip for ALS casetype + DDS or DPS agency (PHP line 1371-1374).
  const skipMailVendor = casetype === 'ALS' && ['DDS', 'DPS'].includes(agencyCode);
  if (!skipMailVendor) {
    try {
      await saveMailVendorRecord(caseId, templateDoc.documenttype || 'Decision', pdfFileName, attachmentPath, null, userId, pdfBuffer);
    } catch (error) {
      logger.error(`[DispositionQuickAction] Mail vendor record save failed for caseId=${caseId}:`, error);
    }
  }

  // Step 7: Check-in feature — if hearing date was today, update checkin status (non-fatal)
  try {
    await updateCheckinCalendar(caseId, hearingDate, hearingTime, userId);
  } catch (error) {
    logger.error(`[DispositionQuickAction] Check-in calendar update failed for caseId=${caseId}:`, error);
  }

  return { success: true, message: 'Disposition generated successfully.' };
};
