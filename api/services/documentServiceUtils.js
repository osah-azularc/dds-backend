/**
 * Shared utilities used by nohDocumentService, dispositionDocumentService,
 * and continuanceDocumentService to eliminate code duplication.
 */
import { localNow } from '../helpers/timeUtils.js';
import Docket from '../models/Docket.js';
import Casetypes from '../models/Casetypes.js';
import History from '../models/History.js';
import DocumentTemplates from '../models/admin/documentTemplatesModel.js';
import { getMappedTemplateDoc, getMappedTemplateById } from './documentTemplateMappingService.js';

/**
 * Fetch a template document ID/name from the new Admin-managed mapping tables
 * (document_template_casetype_mapping / document_template_mapping_automation / document_templates).
 * Used by NOH ('noh'), Disposition ('decision'), and Continuance ('continuance') services.
 */
export const getTemplateDoc = (automationType, agencyCode, casetype, automationSubType) =>
  getMappedTemplateDoc(automationType, agencyCode, casetype, automationSubType);

/**
 * Fetch a template document by its exact id — used by bulk NOH/Continuance/Disposition, where
 * the selected dropdown option already identifies a specific template (see getMappedTemplateById).
 */
export const getTemplateDocById = (automationType, agencyCode, casetype, documentId) =>
  getMappedTemplateById(automationType, agencyCode, casetype, documentId);

/**
 * Fetches a template directly by filename, bypassing mapping/automation tables.
 * Used only by bulkExportDocHelper.js to match the legacy PHP bulk export flow.
 * Deliberately ignores the admin active/inactive toggle: legacy ExportBulkDoc.php loaded
 * the .docx straight off disk with no such concept, and bulk export intentionally mirrors
 * that "exists = usable" behavior rather than the active-aware lookups used by
 * NOH/disposition/continuance (see getMappedTemplateDoc).
 *
 * Exact match only — deliberately deviates from legacy ExportBulkDoc.php, which ran
 * `documentname LIKE '%...%'` and kept whichever row it saw last. `_` and `%` are SQL
 * wildcards, so a name like 'ALS_91-day letter.docx' could match unrelated templates whose
 * name happens to contain that substring, silently using the wrong legal document.
 */
export const getTemplateDocByName = async (documentName) => {
  const docs = await DocumentTemplates.findAll({
    attributes: ['id', 'documentname', 'documenttype'],
    where: { documentname: documentName },
    raw: true,
  });

  if (docs.length === 0) return null;
  if (docs.length > 1) {
    // Template names should be unique; more than one exact match means the template library
    // itself has bad data — surface that loudly rather than silently picking one.
    throw new Error(
      `Multiple document templates are named exactly '${documentName}' (ids: ${docs.map((d) => d.id).join(', ')}). `
      + 'Template names must be unique — rename or remove the duplicates before running bulk export.',
    );
  }

  const [doc] = docs;
  return { documentId: doc.id, documentname: doc.documentname, documenttype: doc.documenttype };
};

/**
 * Insert the "Quick Action: A Document template has been added." history entry.
 * Mirrors PHP generateDocumentTemplate history (line 1450).
 * Each automation type passes its own typeLabel (e.g. 'Noh Type', 'Decision Type', 'Continuance Type').
 */
export const insertDocumentTemplateAddedHistoryBase = async (
  caseid, typeLabel, pdfFileName, doctype, automationSubType, username, transaction,
) => {
  const description =
    '<p class="history-title">Quick Action: A Document template has been added.</p>' +
    `<p><span class="history-label">${typeLabel}:</span><span class="history-data">${automationSubType || ''}</span></p>` +
    `<p><span class="history-label">Document Name:</span><span class="history-data">${pdfFileName || ''}</span></p>` +
    `<p><span class="history-label">Document Type:</span><span class="history-data">${doctype || ''}</span></p>`;

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
 * Fetch raw docket row + matching Casetypes row for a given caseid.
 * Returns null when the docket does not exist.
 * Callers map the raw rows to their own shaped return objects.
 */
export const fetchDocketAndCasetype = async (caseid) => {
  const docketRow = await Docket.findOne({
    attributes: [
      'caseId', 'refAgency', 'caseType', 'caseName', 'judge', 'judgeAssistant',
      'hearingDate', 'hearingTime', 'dateReceivedByOSAH',
    ],
    where: { caseId: caseid },
    raw: true,
  });
  if (!docketRow) return null;

  const ctRow = await Casetypes.findOne({
    attributes: ['caseTypeId', 'agencyId'],
    where: { caseCode: docketRow.caseType, agencyCode: docketRow.refAgency },
    raw: true,
  });

  return { docketRow, ctRow };
};
