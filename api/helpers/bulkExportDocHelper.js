/**
 * Node port of PHP Osahform::exportdocsfuncAction() / ExportBulkDoc::generateBulkDocuments().
 * Writes only documentstable + attachmentpaths (+ bulkdoc_report for DDS/ALS) — no status
 * change/history, unlike nohGenerationHelper.js.
 */
import fs from 'node:fs';
import { Op, where as sequelizeWhere, fn, col } from 'sequelize';
import moment from 'moment';
import { mysqlSequelize } from '../../connections/seqDB.js';
import { logger } from '../../config/winstonLogger.js';
import Docket from '../models/Docket.js';
import PeopleDetails from '../models/PeopleDetails.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../models/AttorneyByCase.js';
import BulkDocReport from '../models/reports/BulkDocReport.js';
import { getTemplateDocByName } from '../services/documentServiceUtils.js';
import { buildNOHMergeData, saveNOHDocumentRecord } from '../services/nohDocumentService.js';
import { generateAndSaveNOHPdf, getEfsTemplatePath } from '../services/nohPdfService.js';
import { saveMailVendorRecord } from './docketQuickAction/mailVendorHelper.js';
import {
  generateBulkMailBatchTimestamp,
  buildBulkMailFileName,
  copyToBulkMailFolders,
  copyToBulkdocsOnly,
} from '../services/bulkUpload/bulkMailFolderService.js';
import {
  closeDocketForNinetyOneDay,
  copyPdfToNinetyOneDayFolder,
  cleanupExpiredNinetyOneDayMailVendorDocs,
  queueNinetyOneDayMailVendorRecord,
} from '../services/ninetyOneDayLetterService.js';
import { resolveExportDocConfig } from '../constants/exportDocAgencyConfig.js';
import { ValidationError } from './validators.js';

const RESPONDENT_PARTY_TYPE = 'Respondent';

// Only the DDS 91-day letter has its own automation folder + mail-vendor cleanup.
const isDdsNinetyOneDayFlow = (isNinetyOneDay, agencyCode, caseType) =>
  isNinetyOneDay && agencyCode === 'DDS' && caseType === 'ALS';

const buildResultMessage = (successCount, failureCount) => {
  const docLabel = (count) => `${count} document${count === 1 ? '' : 's'}`;
  if (failureCount === 0) return `${docLabel(successCount)} generated successfully.`;
  if (successCount === 0) return `Document generation failed for ${docLabel(failureCount)}.`;
  return `${docLabel(successCount)} generated successfully, ${docLabel(failureCount)} failed.`;
};

// Date comparisons use DATE(column) instead of a plain equality against the DataTypes.DATE
// column — Sequelize otherwise coerces the date string through the server's local timezone,
// silently shifting it across midnight.
export const findMatchingDocketsForExport = async ({ agencyCode, caseType, dateReceived, ninetyOneDay, caseIds }) => {
  const where = {
    refAgency: agencyCode,
    caseType,
    telvOFive: '1',
  };
  const dateConditions = [sequelizeWhere(fn('DATE', col('datereceivedbyOSAH')), dateReceived)];

  if (ninetyOneDay) {
    where.county = { [Op.like]: '%No County%' };
    where.status = { [Op.ne]: 'Closed' };
    // PHP: DATEDIFF(CURRENT_DATE(), docket_createddate) > 90
    const cutoff = moment().subtract(90, 'days').format('YYYY-MM-DD');
    dateConditions.push(sequelizeWhere(fn('DATE', col('docket_createddate')), { [Op.lt]: cutoff }));
  } else {
    where.county = { [Op.notLike]: '%No County%' };
    where.status = { [Op.notIn]: ['Closed', 'Pending'] };
    where.hearingDate = { [Op.ne]: null };
  }

  if (Array.isArray(caseIds) && caseIds.length > 0) {
    const parsedIds = caseIds.map(Number).filter(Number.isInteger);
    if (parsedIds.length > 0) where.caseId = { [Op.in]: parsedIds };
  }

  return Docket.findAll({ attributes: ['caseId'], where: { ...where, [Op.and]: dateConditions }, raw: true });
};

// documentstable + attachmentpaths + bulkdoc_report for DDS/ALS.
const saveExportDocRecords = async ({
  caseId, agencyCode, caseType, templateDoc, attachmentPath, pdfFileName, userId, transaction,
}) => {
  const documentId = await saveNOHDocumentRecord(caseId, templateDoc, attachmentPath, pdfFileName, transaction);

  if (agencyCode === 'DDS' && caseType === 'ALS') {
    await BulkDocReport.create({ caseId, userId, documentId }, { transaction });
  }
  return documentId;
};

// A contact type only counts as mailable if its row has a non-blank address1 (or, for
// peopledetails, altAddress1) — a matching row with no real address doesn't get a mail copy.
const NON_BLANK = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };

const getExistingPartyTypesForDocket = async (caseId, partyTypes) => {
  const where = { caseId, typeOfContact: { [Op.in]: partyTypes } };
  const [people, caseworkers, attorneys] = await Promise.all([
    PeopleDetails.findAll({
      attributes: ['typeOfContact'],
      where: { ...where, [Op.or]: [{ address1: NON_BLANK }, { altAddress1: NON_BLANK }] },
      raw: true,
    }),
    AgencyCaseworkerByCase.findAll({ attributes: ['typeOfContact'], where: { ...where, address1: NON_BLANK }, raw: true }),
    AttorneyByCase.findAll({ attributes: ['typeOfContact'], where: { ...where, address1: NON_BLANK }, raw: true }),
  ]);
  return new Set([...people, ...caseworkers, ...attorneys].map((row) => row.typeOfContact));
};

/** Drop the PDF into Bulkdocs/Clerkdocs for every selected mailer contact. */
const dropBulkMailCopies = (caseId, pdfBuffer, templateDoc, batchTimestamp, mailerContacts) => {
  const clerkdocsFileName = buildBulkMailFileName(caseId, templateDoc.documentname, batchTimestamp);
  const bulkdocsFileName = buildBulkMailFileName(caseId, templateDoc.documentname, batchTimestamp, {
    isRespondentCopy: mailerContacts[0] === RESPONDENT_PARTY_TYPE,
  });
  copyToBulkMailFolders(pdfBuffer, batchTimestamp, { bulkdocsFileName, clerkdocsFileName });

  for (let i = 1; i < mailerContacts.length; i++) {
    const extraFileName = buildBulkMailFileName(caseId, templateDoc.documentname, batchTimestamp, {
      recipientIndex: i + 1,
      isRespondentCopy: mailerContacts[i] === RESPONDENT_PARTY_TYPE,
    });
    copyToBulkdocsOnly(pdfBuffer, extraFileName, batchTimestamp);
  }
};

async function processExportDocForDocket(caseId, ctx) {
  const {
    agencyCode, caseType, isNinetyOneDay, mailerContacts, userId, batchTimestamp, enableMailVendorQueue,
    templateDoc,
  } = ctx;

  // If none of the selected contacts have a usable address, generate nothing for this docket —
  // checked before any DB write so an address problem never leaves a 91-day docket closed
  // without its letter having actually been generated.
  const existingPartyTypes = await getExistingPartyTypesForDocket(caseId, mailerContacts);
  const existingMailerContacts = mailerContacts.filter((contact) => existingPartyTypes.has(contact));
  if (existingMailerContacts.length === 0) {
    return { error: `None of the selected mailer contacts (${mailerContacts.join(', ')}) have a usable address on this docket` };
  }

  // templateDoc is resolved once for the whole batch — only merge/render can fail per docket.
  let pdfFileName; let pdfBuffer; let attachmentPath;
  try {
    const mergeData = await buildNOHMergeData(caseId);
    ({ attachmentPath, pdfFileName, pdfBuffer } = await generateAndSaveNOHPdf(caseId, templateDoc, mergeData));
  } catch (err) {
    logger.error(`Bulk export doc rendering failed for docket ${caseId}:`, err);
    return { error: err.message };
  }

  // Document record + (for the 91-day flow) the docket closure land in the same transaction —
  // a docket is only ever closed once its letter has been generated and saved, and a failure at
  // either step rolls both back, leaving the docket exactly as it was. Deliberately deviates from
  // legacy ExportBulkDoc.php, which closes the docket unconditionally before generating anything
  // and never rolls back — that ordering is what let a docket show Closed with no letter ever
  // created.
  const t = await mysqlSequelize.transaction();
  try {
    await saveExportDocRecords({ caseId, agencyCode, caseType, templateDoc, attachmentPath, pdfFileName, userId, transaction: t });
    if (isNinetyOneDay) {
      await closeDocketForNinetyOneDay(caseId, userId, t);
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    logger.error(`Bulk export doc DB write failed for docket ${caseId}:`, err);
    return { error: err.message };
  }

  // Post-commit delivery. The document row is already correctly saved at this point, so a
  // failure here doesn't undo that — but it must not be reported as a success either: the clerk
  // still needs the file in Bulkdocs/Clerkdocs (or the mail-vendor queue) to actually mail it.
  try {
    dropBulkMailCopies(caseId, pdfBuffer, templateDoc, batchTimestamp, existingMailerContacts);

    if (enableMailVendorQueue) {
      await saveMailVendorRecord(caseId, templateDoc.documenttype, pdfFileName, attachmentPath, null, userId, pdfBuffer);
    }

    if (isDdsNinetyOneDayFlow(isNinetyOneDay, agencyCode, caseType)) {
      copyPdfToNinetyOneDayFolder(pdfBuffer, pdfFileName, batchTimestamp);
      await queueNinetyOneDayMailVendorRecord(caseId, pdfFileName, batchTimestamp, userId);
    }
  } catch (error) {
    logger.error(`Bulk export doc distribution step failed for docket ${caseId}:`, error);
    return { error: `Document was generated and saved, but delivery failed: ${error.message}` };
  }

  return { error: null };
}

// Defense-in-depth for callers that bypass bulkExportDocValidators.js (e.g. the cron job) —
// the HTTP route validates the full payload shape before this helper is ever invoked.
const validateBulkExportDocPayload = ({ refAgencyId, dateReceived, mailerContacts }) => {
  if (!refAgencyId) throw new ValidationError('refAgencyId is required', 'refAgencyId');
  if (!dateReceived) throw new ValidationError('dateReceived is required', 'dateReceived');
  if (!Array.isArray(mailerContacts) || mailerContacts.length === 0) {
    throw new ValidationError('mailerContacts must be a non-empty array', 'mailerContacts');
  }
};

// Legacy: $textype = mailer_contact . "+" . party_contact (ExportBulkDoc.php:123) — the UI's
// "Parties Copied" list is appended onto the same contact-type list that decides who gets a
// mailed copy, not treated separately. We mirror that by concatenating, not merging/deduping,
// to match legacy's explode("+", $textype) behaviour exactly (a repeated type gets a repeated copy).
const buildAllMailerContacts = (mailerContacts, partyContacts) => (
  Array.isArray(partyContacts) && partyContacts.length > 0
    ? [...mailerContacts, ...partyContacts]
    : mailerContacts
);

const resolveExportDocRunConfig = (refAgencyId, documentVariant, ninetyOneDay) => {
  const { agencyCode, caseType, variant, enableMailVendorQueue } = resolveExportDocConfig(refAgencyId, documentVariant);
  const isNinetyOneDay = ninetyOneDay === 'yes' || ninetyOneDay === true;
  if (isNinetyOneDay && !variant.ninetyOneDayEligible) {
    throw new ValidationError(`Document variant '${documentVariant}' does not support the 91-day letter flow`, 'ninetyOneDay');
  }
  return { agencyCode, caseType, variant, enableMailVendorQueue, isNinetyOneDay };
};

// Checked once, up front, before any docket is closed — a missing template short-circuits the
// whole run with one clear message instead of failing per docket after the fact. Returns either
// the resolved templateDoc, or a ready-to-return "templateMissing" result for the caller to pass through.
const resolveExportDocTemplateOrMissingResult = async (variant) => {
  const templateDoc = await getTemplateDocByName(variant.documentName);
  if (!templateDoc) {
    return {
      templateDoc: null,
      missingResult: {
        success: [],
        failure: [],
        templateMissing: true,
        message: `Template '${variant.documentName}' does not exist. Please add the template before running bulk export.`,
      },
    };
  }

  // A document_templates row can exist without the .docx actually being on EFS — check that too.
  if (!fs.existsSync(getEfsTemplatePath(templateDoc.documentname))) {
    return {
      templateDoc: null,
      missingResult: {
        success: [],
        failure: [],
        templateMissing: true,
        message: `Template '${templateDoc.documentname}' is registered but its file is missing on the server. Please re-upload the template before running bulk export.`,
      },
    };
  }

  return { templateDoc, missingResult: null };
};

// Once per batch, not per docket — mirrors legacy's post-foreach cleanup.
const runNinetyOneDayCleanup = async (isNinetyOneDay, agencyCode, caseType) => {
  if (!isDdsNinetyOneDayFlow(isNinetyOneDay, agencyCode, caseType)) return;
  try {
    await cleanupExpiredNinetyOneDayMailVendorDocs();
  } catch (error) {
    logger.error('91-day mail vendor cleanup failed:', error);
  }
};

// Entry point mirroring PHP exportdocsfuncAction. payload: refAgencyId, documentVariant?
// (see exportDocAgencyConfig.js), dateReceived, ninetyOneDay?, mailerContacts[], partyContacts?[], caseIds?.
export const generateBulkExportDocHelper = async (payload, userId) => {
  const { refAgencyId, documentVariant, dateReceived, ninetyOneDay, mailerContacts, partyContacts, caseIds } = payload;

  validateBulkExportDocPayload({ refAgencyId, dateReceived, mailerContacts });
  const allMailerContacts = buildAllMailerContacts(mailerContacts, partyContacts);

  const { agencyCode, caseType, variant, enableMailVendorQueue, isNinetyOneDay } =
    resolveExportDocRunConfig(refAgencyId, documentVariant, ninetyOneDay);

  const { templateDoc, missingResult } = await resolveExportDocTemplateOrMissingResult(variant);
  if (missingResult) return missingResult;

  const dockets = await findMatchingDocketsForExport({ agencyCode, caseType, dateReceived, ninetyOneDay: isNinetyOneDay, caseIds });
  if (dockets.length === 0) {
    // Mirrors PHP's "echo 0;".
    return { success: [], failure: [], noRecordsFound: true, message: 'No records found try again.' };
  }

  const batchTimestamp = generateBulkMailBatchTimestamp(); // shared clerk-pickup folder for this run
  const success = [];
  const failure = [];

  // Sequential, mirrors legacy's single-threaded foreach.
  for (const docket of dockets) {
    const { error } = await processExportDocForDocket(docket.caseId, {
      agencyCode, caseType, isNinetyOneDay, mailerContacts: allMailerContacts, userId, batchTimestamp, enableMailVendorQueue,
      templateDoc,
    });
    if (error) {
      failure.push(error);
    } else {
      success.push(docket.caseId);
    }
  }

  await runNinetyOneDayCleanup(isNinetyOneDay, agencyCode, caseType);

  return {
    success,
    failure,
    message: buildResultMessage(success.length, failure.length),
  };
};
