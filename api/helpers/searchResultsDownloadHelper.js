import { Op } from 'sequelize';
import { generateDocketPDF } from './pdfGenerationHelper.js';
import { createZipFile, cleanupOldZipFiles } from './zipHelper.js';
import { normalizeAttachmentPath, resolveStorageAbsolutePath } from './docketDetail/storagePathUtils.js';
import { Docket, PeopleDetails, DocumentsTable, AttachmentPaths } from '../models/index.js';
import AttorneyByCase from '../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';
import MinorDetails from '../models/MinorDetails.js';
import puppeteer from 'puppeteer';
import moment from 'moment-timezone';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { logger } from "../../config/winstonLogger.js";

// Constants
const MAX_DOWNLOAD_CASES = 100;
const VALID_DOWNLOAD_TYPES = ['case-files', 'decisions'];
const INVALID_ZIP_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

/**
 * Validate the inputs to downloadCaseFilesInZip.
 * Returns { error } on failure or { validCaseIds } on success.
 */
function validateDownloadRequest(caseIds, downloadType, userSessionData) {
  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    return { error: 'Invalid caseIds: must be non-empty array', isValidationError: true };
  }
  if (!VALID_DOWNLOAD_TYPES.includes(downloadType)) {
    return { error: `Invalid downloadType. Must be one of: ${VALID_DOWNLOAD_TYPES.join(', ')}`, isValidationError: true };
  }
  if (!userSessionData?.user_id) {
    return { error: 'Invalid userSessionData: missing user_id', isValidationError: true };
  }
  const validCaseIds = caseIds.filter(id => id && (typeof id === 'string' || typeof id === 'number'));
  if (validCaseIds.length === 0) {
    return { error: 'No valid case IDs provided', isValidationError: true };
  }
  if (validCaseIds.length > MAX_DOWNLOAD_CASES) {
    return { error: `Download limit exceeded. Maximum ${MAX_DOWNLOAD_CASES} cases allowed per download.`, isValidationError: true };
  }
  return { validCaseIds };
}

/**
 * Build the safe ZIP file name from options/user data and a timestamp.
 * Legacy PHP: $judge_name = $param['judgename'] . date('hims');
 */
function buildZipFileName(options, userSessionData, timestamp) {
  const { judgeName } = options;
  const legacyTimeSuffix = moment.tz(timestamp, 'America/New_York').format('hhmmMMss');
  const safeJudgeName = String(judgeName || '')
    .replaceAll(INVALID_ZIP_FILENAME_CHARS, '')
    .trim();
  return `${safeJudgeName}${legacyTimeSuffix}.zip`;
}

/**
 * Group an array of rows into a Map<caseId, row[]> for O(1) per-case lookup.
 * Handles both raw Sequelize objects (raw:true) and model instances.
 */
function groupByCaseId(rows) {
  const map = new Map();
  for (const row of rows) {
    const cid = String(row.caseId ?? row.caseid ?? '');
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(row);
  }
  return map;
}

async function copyLargeFilesReportIfPresent(documents, caseId, caseFolder) {
  const hasAltStorage = documents.some((doc) => String(doc?.isAltStorage ?? '0') === '1');
  if (!hasAltStorage || !caseFolder) return;

  const targetLargeFilesPath = path.join(caseFolder, 'largefiles.txt');

  const firstAttachmentPath = documents
    .flatMap((doc) => doc?.attachmentPaths || [])
    .map((attachment) => attachment?.attachmentPath)
    .find(Boolean);

  if (firstAttachmentPath) {
    const normalizedAttachmentPath = normalizeAttachmentPath(firstAttachmentPath);
    const caseIdMarker = `/${String(caseId)}/`;
    const caseIdIndex = normalizedAttachmentPath.indexOf(caseIdMarker);

    if (caseIdIndex !== -1) {
      const caseFolderPath = normalizedAttachmentPath.substring(0, caseIdIndex + caseIdMarker.length - 1);
      const { absolutePath: sourceLargeFilesPath } = resolveStorageAbsolutePath(`${caseFolderPath}/largefiles.txt`);

      if (fsSync.existsSync(sourceLargeFilesPath)) {
        await fs.copyFile(sourceLargeFilesPath, targetLargeFilesPath);
        return;
      }
    }
  }

  const largeFileEntries = documents
    .map((doc) => String(doc?.documentNameInAwsBucket ?? '').trim())
    .filter((name) => name !== '');

  const numberedLargeFileEntries = largeFileEntries.map((name, index) => `${index + 1}. ${name}`);
  const largeFilesContent = numberedLargeFileEntries.length > 0
    ? `${numberedLargeFileEntries.join('\n')}\n`
    : '';

  await fs.writeFile(targetLargeFilesPath, largeFilesContent, 'utf8');
}

/**
 * Create the ZIP archive from folderDir and always clean up the temp folder afterwards.
 */
async function createAndCleanup(folderDir, zipFilePath) {
  try {
    await createZipFile(folderDir, zipFilePath);
  } finally {
    try {
      await fs.rm(folderDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.error(`[Download] Failed to cleanup temporary folder ${folderDir}: ${cleanupError.message}`);
    }
  }
}

/**
 * Download case files as ZIP.
 *
 * Performance approach (mirrors PHP bulk-then-zip behaviour):
 *   1. All DB queries run upfront in a single Promise.all (6 bulk queries instead of N×6 serial ones).
 *   2. One Puppeteer browser is launched and shared across all PDF generations, avoiding the
 *      ~2–3 s per-case startup cost of launching a fresh browser for each case.
 *   3. All cases are processed in parallel via Promise.allSettled.
 *
 * @param {Array}  caseIds
 * @param {String} downloadType - 'case-files' or 'decisions'
 * @param {Object} userSessionData
 * @param {Object} options - Extra options (judgeName, docType from legacy PHP API)
 * @returns {Promise<Object>}
 */
export const downloadCaseFilesInZip = async (caseIds, downloadType, userSessionData, options = {}) => {
  const failedDocuments = [];
  const failedCases = [];

  try {
    const validation = validateDownloadRequest(caseIds, downloadType, userSessionData);
    if (validation.error) {
      return { success: false, error: validation.error, isValidationError: validation.isValidationError };
    }

    const { validCaseIds } = validation;
    const userId = userSessionData.user_id || 'temp';
    const timestamp = Date.now();
    const folderDir = path.join(process.cwd(), 'public', 'upload', String(userId), `Folder_${timestamp}`);

    await fs.mkdir(folderDir, { recursive: true });
    await cleanupOldZipFiles(userId);

    // --- 1. Pre-fetch ALL data in parallel (one roundtrip per table) ---
    const docWhere = { caseId: { [Op.in]: validCaseIds } };
    if (downloadType === 'decisions') docWhere.documentType = 'Decision';

    const [dockets, allPeople, allDocs, allAttorneys, allCaseWorkers, allMinors] = await Promise.all([
      Docket.findAll({ where: { caseId: { [Op.in]: validCaseIds } }, raw: true }),
      PeopleDetails.findAll({ where: { caseId: { [Op.in]: validCaseIds } }, raw: true }),
      DocumentsTable.findAll({
        where: docWhere,
        include: [{ model: AttachmentPaths, as: 'attachmentPaths', required: false }],
        order: [['createdDate', 'ASC']],
      }),
      AttorneyByCase.findAll({ where: { caseId: { [Op.in]: validCaseIds } }, raw: true }),
      AgencyCaseworkerByCase.findAll({ where: { caseId: { [Op.in]: validCaseIds } }, raw: true }),
      MinorDetails.findAll({ where: { caseId: { [Op.in]: validCaseIds } }, raw: true }),
    ]);

    // Build per-caseId lookup maps for O(1) access
    const docketMap = new Map(dockets.map(d => [String(d.caseId ?? d.caseid), d]));
    const peopleMap = groupByCaseId(allPeople);
    const docsMap = groupByCaseId(allDocs);
    const attorneyMap = groupByCaseId(allAttorneys);
    const caseWorkerMap = groupByCaseId(allCaseWorkers);
    const minorMap = groupByCaseId(allMinors);

    // --- 2. Launch one shared Puppeteer browser for all PDF generations ---
    let browser = null;
    if (downloadType !== 'decisions') {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }

    let totalFilesAdded = 0;

    try {
      // --- 3. Process all cases in parallel ---
      const settled = await Promise.allSettled(
        validCaseIds.map(caseId =>
          processCaseForDownload(caseId, folderDir, downloadType, {
            docket: docketMap.get(String(caseId)),
            peopleDetails: peopleMap.get(String(caseId)) || [],
            documents: docsMap.get(String(caseId)) || [],
            attorneyDetails: attorneyMap.get(String(caseId)) || [],
            caseWorkerDetails: caseWorkerMap.get(String(caseId)) || [],
            minorDetails: minorMap.get(String(caseId)) || [],
            browser,
          })
        )
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const r = outcome.value;
          if (r.failedDocuments?.length) failedDocuments.push(...r.failedDocuments);
          if (r.failed) failedCases.push({ caseId: r.caseId, reason: r.reason });
          totalFilesAdded += r.filesAdded || 0;
        } else {
          failedCases.push({ reason: outcome.reason?.message });
        }
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    // Mirrors PHP: when docType==2 (decisions) and nothing was added, return noDocumentsFound
    if (downloadType === 'decisions' && totalFilesAdded === 0) {
      try { await fs.rm(folderDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
      return { success: false, noDocumentsFound: true };
    }

    const zipFileName = buildZipFileName(options, userSessionData, timestamp);
    const zipFilePath = path.join(process.cwd(), 'public', 'upload', String(userId), zipFileName);

    await createAndCleanup(folderDir, zipFilePath);

    if (failedDocuments.length > 0) logger.warn(`[Download] ${failedDocuments.length} document(s) failed to download`);
    if (failedCases.length > 0) logger.warn(`[Download] ${failedCases.length} case(s) failed to process`);

    if (fsSync.existsSync(zipFilePath)) {
      return { success: true, zipFilePath, zipFileName, failedDocuments, failedCases };
    }
    return { success: false, error: 'Failed to create ZIP file' };
  } catch (error) {
    logger.error(`[Download] Critical error in downloadCaseFilesInZip: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Process a single case using pre-fetched data (no DB queries inside).
 *
 * @param {String} caseId
 * @param {String} folderDir
 * @param {String} downloadType
 * @param {Object} prefetched - Pre-fetched data + shared Puppeteer browser
 */
async function processCaseForDownload(caseId, folderDir, downloadType, prefetched) {
  const { docket, peopleDetails, documents, attorneyDetails, caseWorkerDetails, minorDetails, browser } = prefetched;
  const failedDocuments = [];
  let filesAdded = 0;

  // For decisions-only download, files go directly into folderDir — no per-case folder needed.
  // This mirrors PHP: $docType==2 skips $zip->addEmptyDir($folder_name).
  const caseFolder = downloadType !== 'decisions' ? path.join(folderDir, String(caseId)) : null;
  if (caseFolder) {
    await fs.mkdir(caseFolder, { recursive: true });
  }

  try {
    if (!docket) {
      try { await generateDocketPDF(caseId, null, [], [], caseFolder, {}); } catch (_) { /* ignore */ }
      return { caseId, failedDocuments, failed: true, reason: 'Case not found' };
    }

    if (documents && documents.length > 0) {
      let incrementOp = 1;

      for (const doc of documents) {
        if (downloadType === 'decisions' && doc.documentType !== 'Decision') {
          continue;
        }

        const attachmentPaths = doc.attachmentPaths || [];
        if (attachmentPaths.length === 0) {
          continue;
        }

        for (const ap of attachmentPaths) {
          try {
            const attachmentPath = ap.attachmentPath;
            if (!attachmentPath) continue;

            const { absolutePath: sourceFilePath } = resolveStorageAbsolutePath(attachmentPath);

            if (!fsSync.existsSync(sourceFilePath)) {
              failedDocuments.push({ caseId, documentId: doc.documentId, reason: 'File not found', path: attachmentPath });
              continue;
            }

            const fileName = path.basename(attachmentPath);
            // Mirrors PHP: date("Ymd_His", filemtime($file)) — file's own mtime, not "now".
            const fileModTime = fsSync.statSync(sourceFilePath).mtime;
            const tsPrefix = moment.tz(fileModTime, 'America/New_York').format('YYYYMMDD_HHmmss');

            if (downloadType === 'case-files') {
              const targetFolder = path.join(caseFolder, doc.documentType || 'Other');
              await fs.mkdir(targetFolder, { recursive: true });
              await fs.copyFile(sourceFilePath, path.join(targetFolder, `${tsPrefix}_${incrementOp++}_${fileName}`));
              filesAdded++;
            } else if (downloadType === 'decisions') {
              await fs.copyFile(sourceFilePath, path.join(folderDir, `${tsPrefix}_${incrementOp++}_${fileName}`));
              filesAdded++;
            } else {
              const targetFolder = caseFolder || folderDir;
              await fs.copyFile(sourceFilePath, path.join(targetFolder, `${incrementOp++}-${fileName}`));
              filesAdded++;
            }
          } catch (error) {
            failedDocuments.push({ caseId, documentId: doc.documentId, reason: error.message, path: ap.attachmentPath });
          }
        }
      }
    }

    // Check for DDS Form1
    const ddsForm1Doc = documents.find(doc => doc.documentName === `${caseId}_ddsform1.pdf`);
    if (ddsForm1Doc && downloadType !== 'decisions') {
      const ddsAp = ddsForm1Doc.attachmentPaths?.[0];
      if (ddsAp?.attachmentPath) {
        const { absolutePath: ddsSourcePath } = resolveStorageAbsolutePath(ddsAp.attachmentPath);
        if (fsSync.existsSync(ddsSourcePath)) {
          await fs.copyFile(ddsSourcePath, path.join(caseFolder, `${caseId}_ddsform1.pdf`));
        }
      }
    }

    // Generate PDF report using shared browser and pre-fetched relation data
    if (downloadType !== 'decisions') {
      try {
        await generateDocketPDF(caseId, docket, peopleDetails, documents, caseFolder, {
          browser,
          attorneyDetails,
          agencyCaseWorkerDetails: caseWorkerDetails,
          minorDetails,
        });
      } catch (pdfError) {
        logger.error(`[Download] Failed to generate PDF for case ${caseId}: ${pdfError.message}`);
      }
    }

    if (downloadType !== 'decisions') {
      await copyLargeFilesReportIfPresent(documents, caseId, caseFolder);
    }

    return { caseId, failedDocuments, failed: false, filesAdded };
  } catch (error) {
    logger.error(`[Download] Failed to process case ${caseId}: ${error.message}`);
    return { caseId, failedDocuments, failed: true, reason: error.message, filesAdded };
  }
}
