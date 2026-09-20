/**
 * NOH Document Service
 * Handles per-docket NOH document generation, DB writes, and history logging.
 * Mirrors the PHP NOHAutomation + generateDocumentTemplate logic.
 * PDF/EFS logic lives in nohPdfService.js.
 */
import moment from 'moment';
import Docket from '../models/Docket.js';
import DocumentsTable from '../models/DocumentsTable.js';
import { getFieldTokenMap } from './templateFieldMatcher.js';
import { buildCaseContext } from './documentTemplates/contextBuilder/caseContextBuilderService.js';
import { resolveFields } from './documentTemplates/resolvers/resolverEngine.js';
import AttachmentPathsModel from '../models/AttachmentPathsModel.js';
import DecisionAutomationReport from '../models/reports/DecisionAutomationReport.js';
import { getTemplateDoc, getTemplateDocById, insertDocumentTemplateAddedHistoryBase } from './documentServiceUtils.js';

export { generateAndSaveNOHPdf } from './nohPdfService.js';

/**
 * Fetch the NOH template document ID and name from the Admin-managed mapping tables.
 */
export const getNOHTemplateDoc = async (agencyCode, casetype, automationSubType) =>
  getTemplateDoc('noh', agencyCode, casetype, automationSubType);

/** Fetch the NOH template by its exact id — used by bulk NOH (see getTemplateDocById). */
export const getNOHTemplateDocById = async (agencyCode, casetype, documentId) =>
  getTemplateDocById('noh', agencyCode, casetype, documentId);



/**
 * Build the merge field data for the NOH template.
 * Delegates to buildCaseContext + resolveFields + catalog token map so this
 * service no longer owns any data-fetching or field-mapping logic.
 *
 * @param {number} caseId - Docket case ID
 * @param {object} [overrides] - Optional overrides for NOH-specific new values
 * @param {string} [overrides.hearingDate] - New hearing date (ISO string)
 * @param {string} [overrides.hearingTime] - New hearing time (HH:mm:ss)
 * @param {string} [templateFamily='legacy_core'] - Catalog family to query
 * @returns {Promise<Object>} Merge data keyed by template placeholder names
 */
export const buildNOHMergeData = async (caseId, overrides = {}, templateFamily = 'legacy_core') => {
  const [tokenMap, context] = await Promise.all([
    getFieldTokenMap(templateFamily),
    buildCaseContext(caseId, overrides),
  ]);

  const resolvedData = await resolveFields(Object.keys(tokenMap), context);

  const mergeData = {};
  for (const [fieldKey, tokenName] of Object.entries(tokenMap)) {
    mergeData[tokenName] = resolvedData[fieldKey] ?? '';
  }
  return mergeData;
};

/**
 * Save document record to documentstable + attachmentpaths.
 */
export const saveNOHDocumentRecord = async (caseid, templateDoc, attachmentPath, pdfFileName, transaction) => {
  const today = moment().format('YYYY-MM-DD');
  const docRecord = await DocumentsTable.create(
    {
      caseId: caseid,
      documentType: templateDoc.documenttype || 'NOH',
      dateRequested: today,
      description: '',
      documentName: pdfFileName,
      docketCaseId: caseid,
      docFileFlage: 0,
      casetypeDocId: templateDoc.documentId,
      createdDate: new Date(),
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
 * Update docket status to 'Hearing Scheduled'.
 */
export const updateDocketStatusForNOH = async (caseid, transaction) => {
  await Docket.update(
    { status: 'Hearing Scheduled', modifiedDate: new Date() },
    { where: { caseId: caseid }, transaction }
  );
};

/**
 * Insert the "A Document template has been added." history entry for NOH.
 * Mirrors PHP generateDocumentTemplate history insert (line 1450) called with automationType='noh'.
 * PHP: flag=="1" → "Quick Action: " prefix; ucfirst('noh') → "Noh Type:" label.
 */
export const insertNOHDocumentTemplateHistory = async (
  caseid, pdfFileName, doctype, automationSubType, username, transaction,
) => insertDocumentTemplateAddedHistoryBase(caseid, 'Noh Type', pdfFileName, doctype, automationSubType, username, transaction);

/**
 * Insert decision_automation_report entry.
 * bulkFlag: '1' for bulk designation, '0' for single quick-action NOH.
 */
export const insertNOHAutomationReport = async (docket, automationSubType, transaction, bulkFlag = '0') => {
  await DecisionAutomationReport.create(
    {
      caseId: docket.caseid,
      caseName: docket.casename || '',
      automationSubType,
      status: 'Active',
      cma: docket.cma || '',
      judge: docket.judge || '',
      agencyId: docket.agencyId || 0,
      caseTypeId: docket.casetypeid || 0,
      hearingDate: docket.newHearingDate || null,
      dateReceived: docket.getDateReceived || new Date(),
      decisionAutomationDate: new Date(),
      automationFlag: 'noh',
      bulkDesignationFlag: bulkFlag,
    },
    { transaction }
  );
};
