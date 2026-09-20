/**
 * Disposition Document Service
 * Handles per-docket Disposition document generation, DB writes, and case closure.
 * Mirrors the PHP dispositionAutomation + generateDocumentTemplate logic exactly.
 */
import Docket from '../models/Docket.js';
import { localNow } from '../helpers/timeUtils.js';
import DocumentsTable from '../models/DocumentsTable.js';
import AttachmentPathsModel from '../models/AttachmentPathsModel.js';
import History from '../models/History.js';
import DecisionAutomationReport from '../models/reports/DecisionAutomationReport.js';
import DocketDisposition from '../models/DocketDisposition.js';
import DocketOpenCloseDetails from '../models/DocketOpenCloseDetails.js';
import { getTemplateDoc, getTemplateDocById, insertDocumentTemplateAddedHistoryBase, fetchDocketAndCasetype } from './documentServiceUtils.js';
// EFS-based PDF pipeline shared with NOH/Continuance/Disposition.
export { generateAndSaveNOHPdf as generateAndSaveDispositionPdf } from './nohPdfService.js';

/**
 * Fetch the Disposition (decision) template from the Admin-managed mapping tables.
 */
export const getDispositionTemplateDoc = async (agencyCode, casetype, automationSubType) =>
  getTemplateDoc('decision', agencyCode, casetype, automationSubType);

/** Fetch the Disposition template by its exact id — used by bulk Disposition (see getTemplateDocById). */
export const getDispositionTemplateDocById = async (agencyCode, casetype, documentId) =>
  getTemplateDocById('decision', agencyCode, casetype, documentId);

/**
 * Fetch full docket details needed for Disposition generation.
 */
export const getDispositionDocketDetails = async (caseid) => {
  const result = await fetchDocketAndCasetype(caseid);
  if (!result) return null;
  const { docketRow, ctRow } = result;
  return {
    caseid:          docketRow.caseId,
    agencyCode:      docketRow.refAgency,
    casetype:        docketRow.caseType,
    casename:        docketRow.caseName,
    judge:           docketRow.judge,
    cma:             docketRow.judgeAssistant,
    getHearingDate:  docketRow.hearingDate,
    hearingTime:     docketRow.hearingTime,
    getDateReceived: docketRow.dateReceivedByOSAH,
    casetypeid:      ctRow?.caseTypeId,
    agencyId:        ctRow?.agencyId,
  };
};

/**
 * Save document record to documentstable + attachmentpaths (mirrors PHP generateDocumentTemplate).
 */
export const saveDispositionDocumentRecord = async (caseid, templateDoc, attachmentPath, pdfFileName, transaction) => {
  const docRecord = await DocumentsTable.create(
    {
      caseId:        caseid,
      documentType:  templateDoc.documenttype || 'Decision',
      dateRequested: localNow().format('YYYY-MM-DD'),
      description:   '',
      documentName:  pdfFileName,
      docketCaseId:  caseid,
      docFileFlage:  0,
      casetypeDocId: templateDoc.documentId,
      createdDate:   new Date(),
    },
    { transaction }
  );
  await AttachmentPathsModel.create(
    { documentId: docRecord.documentId, attachmentPath },
    { transaction }
  );
  return docRecord.documentId;
};

/**
 * Delete existing docketdisposition record then insert a new one (mirrors PHP deleteData + insertData).
 */
export const upsertDocketDisposition = async (caseid, automationSubType, userId, transaction) => {
  await DocketDisposition.destroy({ where: { caseId: caseid }, transaction });
  const today = localNow().format('YYYY-MM-DD');
  await DocketDisposition.create(
    {
      caseId:               caseid,
      dispositionCode:      automationSubType,
      dispositionDate:      today,
      signedByJudge:        today,
      mailedDate:           today,
      hearingYesNo:         'No',
      closingClerk:         String(userId || ''),
      docketDispositionDate: new Date(),
    },
    { transaction }
  );
};

/**
 * Update docket: status = 'Closed', closed_date = today (mirrors PHP updateData on docket).
 */
export const closeDocket = async (caseid, transaction) => {
  const today = localNow().format('YYYY-MM-DD');
  await Docket.update(
    { status: 'Closed', closedDate: today, modifiedDate: new Date() },
    { where: { caseId: caseid }, transaction }
  );
};

/**
 * Insert audit record into docket_open_close_details (mirrors PHP insertData with docket_status='closed').
 */
export const insertDocketOpenCloseDetails = async (caseid, userId, transaction) => {
  await DocketOpenCloseDetails.create(
    { caseId: caseid, docketStatus: 'closed', userId: userId || 0 },
    { transaction }
  );
};

/**
 * Insert the "A Document template has been added." history entry for Disposition.
 * Mirrors PHP generateDocumentTemplate history (line 1450) called with automationType='decision'.
 * PHP: flag=="1" → "Quick Action: " prefix; ucfirst('decision') → "Decision Type:" label.
 */
export const insertDispositionDocumentTemplateHistory = async (
  caseid, pdfFileName, doctype, automationSubType, username, transaction,
) => insertDocumentTemplateAddedHistoryBase(caseid, 'Decision Type', pdfFileName, doctype, automationSubType, username, transaction);

/**
 * Insert history entry into the history table (docket History tab).
 * Mirrors PHP dispositionAutomation addHistory($db, $historyData, "history").
 */
export const insertDispositionDocketHistory = async (caseid, username, automationSubType, transaction, startCheckinFeature = 'No') => {
  const now = localNow();
  const today = now.format('MM-DD-YYYY');
  // Mirrors PHP dispositionAutomation: iterates $dispositionArray fields + closedDocket block
  const description =
    '<p class="history-title">Quick Action: Disposition has been added :</p>' +
    `<p><span class="history-label">Caseid:</span><span class="history-data">${caseid}</span></p>` +
    `<p><span class="history-label">Dispositioncode:</span><span class="history-data">${automationSubType}</span></p>` +
    `<p><span class="history-label">Disposition Date:</span><span class="history-data">${today}</span></p>` +
    `<p><span class="history-label">Date Signedby Judge:</span><span class="history-data">${today}</span></p>` +
    `<p><span class="history-label">Mailed Date:</span><span class="history-data">${today}</span></p>` +
    '<p><span class="history-label">Hearingyesno:</span><span class="history-data">No</span></p>' +
    `<p><span class="history-label">Docketdispositiondate:</span><span class="history-data">${now.format('YYYY-MM-DD HH:mm:ss')}</span></p>` +
    `<p><span class="history-label">Updated From Check-In: </span><span class="history-data">${startCheckinFeature}</span></p>` +
    '<p class="history-title">Osah form has been Closed:</p>' +
    `<p><span class="history-label">Closed Date:</span><span class="history-data">${today}</span></p>`;

  await History.create(
    {
      caseId:       caseid,
      docketCaseId: caseid,
      description,
      modifiedBy:   username || '',
      date:         now.format('YYYY-MM-DD'),
      createdTime:  now.format('HH:mm:ss'),
    },
    { transaction }
  );
};

/**
 * Insert decision_automation_report entry for Disposition.
 * bulkFlag: '1' for bulk, '0' for single quick action.
 */
export const insertDispositionAutomationReport = async (docket, automationSubType, transaction, bulkFlag = '0') => {
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
      hearingDate:            docket.getHearingDate || null,
      dateReceived:           docket.getDateReceived || new Date(),
      decisionAutomationDate: new Date(),
      automationFlag:         'decision',
      bulkDesignationFlag:    bulkFlag,
    },
    { transaction }
  );
};
