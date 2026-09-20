/**
 * Continuance Document Service
 * Handles per-docket Continuance document generation, DB writes, and history logging.
 * Mirrors the PHP continuanceAutomation + generateDocumentTemplate logic.
 * PDF/EFS logic is shared with NOH via nohPdfService.generateAndSaveNOHPdf.
 */
import moment from 'moment';
import { logger } from '../../config/winstonLogger.js';
import { localNow } from '../helpers/timeUtils.js';
import Docket from '../models/Docket.js';
import DocumentsTable from '../models/DocumentsTable.js';
import AttachmentPathsModel from '../models/AttachmentPathsModel.js';
import History from '../models/History.js';
import DecisionAutomationReport from '../models/reports/DecisionAutomationReport.js';
import CheckinCalendarTodayDate from '../models/CheckinCalendarTodayDate.js';
import { getTemplateDoc, getTemplateDocById, insertDocumentTemplateAddedHistoryBase, fetchDocketAndCasetype } from './documentServiceUtils.js';

// PDF generation is identical to NOH: EFS template → applyMergeFields → LibreOffice → EFS upload.
// Re-export under the continuance name so callers don't import nohPdfService directly.
export { generateAndSaveNOHPdf as generateAndSaveContinuancePdf } from './nohPdfService.js';

/**
 * Fetch the Continuance template document from the Admin-managed mapping tables
 * (document_template_casetype_mapping / document_template_mapping_automation / document_templates).
 */
export const getContinuanceTemplateDoc = async (agencyCode, casetype, automationSubType) =>
  getTemplateDoc('continuance', agencyCode, casetype, automationSubType);

/** Fetch the Continuance template by its exact id — used by bulk Continuance (see getTemplateDocById). */
export const getContinuanceTemplateDocById = async (agencyCode, casetype, documentId) =>
  getTemplateDocById('continuance', agencyCode, casetype, documentId);

/**
 * Fetch full docket details needed for Continuance generation.
 * Captures currentHearingDate/Time BEFORE any update (used as past_hearing_date).
 */
export const getContinuanceDocketDetails = async (caseid) => {
  const result = await fetchDocketAndCasetype(caseid);
  if (!result) return null;
  const { docketRow, ctRow } = result;
  return {
    caseid:             docketRow.caseId,
    agencyCode:         docketRow.refAgency,
    casetype:           docketRow.caseType,
    casename:           docketRow.caseName,
    judge:              docketRow.judge,
    cma:                docketRow.judgeAssistant,
    currentHearingDate: docketRow.hearingDate,
    currentHearingTime: docketRow.hearingTime,
    getDateReceived:    docketRow.dateReceivedByOSAH,
    casetypeid:         ctRow?.caseTypeId,
    agencyId:           ctRow?.agencyId,
  };
};

/**
 * Update docket with new hearing date, time, and status = 'Rescheduled'.
 * PHP does this BEFORE generating the document.
 */
export const updateDocketForContinuance = async (caseid, newHearingDate, newHearingTime, transaction = null) => {
  await Docket.update(
    { hearingDate: newHearingDate, hearingTime: newHearingTime, status: 'Rescheduled', modifiedDate: new Date() },
    { where: { caseId: caseid }, transaction },
  );
};

/**
 * Save document record to documentstable + attachmentpaths.
 * Returns the inserted documentId.
 */
export const saveContinuanceDocumentRecord = async (caseid, templateDoc, attachmentPath, pdfFileName, transaction) => {
  const today = localNow().format('YYYY-MM-DD');
  const docRecord = await DocumentsTable.create(
    {
      caseId:          caseid,
      documentType:    templateDoc.documenttype || 'Continuance',
      dateRequested:   today,
      description:     '',
      documentName:    pdfFileName,
      docketCaseId:    caseid,
      docFileFlage:    0,
      casetypeDocId:   templateDoc.documentId,
      createdDate:     new Date(),
    },
    { transaction },
  );
  await AttachmentPathsModel.create(
    { documentId: docRecord.documentId, attachmentPath },
    { transaction },
  );
  return docRecord.documentId;
};

/**
 * Insert a row into the history table (docket History tab).
 * Mirrors PHP continuanceAutomation addHistory($db, $historyData, "history").
 */
export const insertContinuanceDocketHistory = async (caseid, username, newHearingDate, newHearingTime, transaction, startCheckinFeature = 'No') => {
  const formattedDate = newHearingDate
    ? moment(newHearingDate, ['YYYY-MM-DD', 'MM-DD-YYYY']).format('MM-DD-YYYY')
    : '';
  const formattedTime = newHearingTime
    ? moment(newHearingTime, 'HH:mm:ss').format('h:mm A')
    : '';

  const description =
    '<p class="history-title">Quick Action: Osah form has been updated:</p>' +
    `<p><span class="history-label">Hearing Date:</span><span class="history-data">${formattedDate}</span></p>` +
    `<p><span class="history-label">Hearing Time:</span><span class="history-data">${formattedTime}</span></p>` +
    `<p><span class="history-label">Updated From Check-In: </span><span class="history-data">${startCheckinFeature}</span></p>`;

  const now = localNow();
  await History.create(
    {
      caseId:       caseid,
      docketCaseId: caseid,
      description,
      modifiedBy:   username || '',
      date:         now.format('YYYY-MM-DD'),
      createdTime:  now.format('HH:mm:ss'),
    },
    { transaction },
  );
};

/**
 * Insert the "A Document template has been added." history entry.
 * Mirrors PHP generateDocumentTemplate history insert (lines 1446-1459).
 * PHP: flag=="1" → "Quick Action: " prefix; automationType='continuance' ≠ 'attachdoc' → shows type line.
 * Called AFTER saveContinuanceDocumentRecord (same order as PHP generateDocumentTemplate).
 */
export const insertDocumentTemplateAddedHistory = async (
  caseid, pdfFileName, doctype, automationSubType, username, transaction,
) => insertDocumentTemplateAddedHistoryBase(caseid, 'Continuance Type', pdfFileName, doctype, automationSubType, username, transaction);

/**
 * Insert decision_automation_report entry for Continuance.
 * Mirrors PHP continuanceAutomation insertData call.
 * bulkFlag: '1' for bulk, '0' for single quick action.
 */
export const insertContinuanceAutomationReport = async (
  docket,
  automationSubType,
  newHearingDate,
  pastHearingDate,
  transaction,
  bulkFlag = '0',
) => {
  await DecisionAutomationReport.create(
    {
      caseId:                 docket.caseid,
      caseName:               docket.casename || '',
      automationSubType,
      status:                 'Active',
      cma:                    docket.cma || '',
      judge:                  docket.judge || '',
      agencyId:               docket.agencyId || 0,
      caseTypeId:             docket.casetypeid || 0,
      hearingDate:            newHearingDate || null,
      dateReceived:           docket.getDateReceived || new Date(),
      decisionAutomationDate: new Date(),
      automationFlag:         'continuance',
      bulkDesignationFlag:    bulkFlag,
      pastHearingDate:        pastHearingDate || null,
    },
    { transaction },
  );
};

/**
 * Mirrors PHP continuanceAutomation check-in feature (lines 1905-1908):
 *   if (currentHearingDate == today) updateDocketStatusToStartCheckinDocket(caseId, ...)
 *
 * Logic from OsahCheckinCalendarModel::updateDocketStatusToStartCheckinDocket:
 *   - Row exists  → UPDATE docket_status_updated_today=1
 *   - Row absent  → INSERT with hearing_time = pastHearingTime (the OLD time, not the new one)
 *
 * Non-fatal — caller wraps in try/catch so a checkin failure never blocks continuance.
 */
export const updateCheckinCalendarForContinuance = async (caseid, pastHearingDate, pastHearingTime, userId = 0) => {
  const today = localNow().format('YYYY-MM-DD');
  if (!pastHearingDate || pastHearingDate !== today) return;

  const existing = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId: caseid, hearingDate: today },
    attributes: ['id'],
  });

  if (existing) {
    await CheckinCalendarTodayDate.update(
      { docketStatusUpdatedToday: '1', modifiedDate: new Date(), modifiedBy: userId },
      { where: { docketCaseId: caseid, hearingDate: today } },
    );
  } else {
    await CheckinCalendarTodayDate.create({
      docketCaseId:             caseid,
      hearingDate:              today,
      startCheckin:             '0',
      docketStatusUpdatedToday: '1',
      hearingTime:              pastHearingTime || null,
      createdDate:              new Date(),
      createdBy:                userId,
    });
  }
};
