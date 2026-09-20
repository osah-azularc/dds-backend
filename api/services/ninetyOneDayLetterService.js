/**
 * Created by: Snehal Narkar | Date: 29-07-2026
 * 91-Day Letter Service — DDS/ALS "no county" auto-close sub-flow of ExportBulkDoc::generateBulkDocuments().
 */
import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import DocketOpenCloseDetails from '../models/DocketOpenCloseDetails.js';
import EcourtMailvendorDocuments from '../models/EcourtMailvendorDocuments.js';
import { upsertDocketDisposition, closeDocket } from './dispositionDocumentService.js';
import { getEfsBasePath } from '../utilities/efsPath.js';
import {
  NINETY_ONE_DAY_DISPOSITION_CODE,
  NINETY_ONE_DAY_DOCUMENT_TYPE,
  NINETY_ONE_DAY_CMA_ID,
  NINETY_ONE_DAY_DOCUMENT_PAGES,
  NINETY_ONE_DAY_FILE_RETENTION_DAYS,
} from '../constants/exportDocAgencyConfig.js';

// Mirrors ExportBulkDoc.php:189-215 — docket_status is 'sys_closed' here (system-driven), unlike manual Disposition's 'closed'.
export const closeDocketForNinetyOneDay = async (caseId, userId, transaction) => {
  await upsertDocketDisposition(caseId, NINETY_ONE_DAY_DISPOSITION_CODE, userId, transaction);
  await closeDocket(caseId, transaction);
  await DocketOpenCloseDetails.create(
    { caseId, docketStatus: 'sys_closed', userId: userId || 0 },
    { transaction },
  );
};

// Must exactly match where copyPdfToNinetyOneDayFolder writes below — this is what gets stored
// in document_file_path, and the mail vendor cron reads/parses it from there.
const buildNinetyOneDayRelativePath = (fileName, batchTimestamp) =>
  `/automation/91dayCases/${batchTimestamp}/${fileName}`;

// Mirrors PHP: file-storage/automation/91dayCases/{batchTimestamp}/{filename}.
export const copyPdfToNinetyOneDayFolder = (pdfBuffer, fileName, batchTimestamp) => {
  const targetDir = path.join(getEfsBasePath(), 'automation', '91dayCases', batchTimestamp);
  fs.mkdirSync(targetDir, { recursive: true });
  // World-writable to match legacy's explicit chmod(0777) for shared clerk/vendor access —
  // see the identical, team-confirmed tradeoff documented in bulkMailFolderService.js.
  fs.chmodSync(targetDir, 0o777);
  fs.writeFileSync(path.join(targetDir, fileName), pdfBuffer);
};

// Mirrors ExportBulkDoc.php:1106-1120 — deletes the file only, the DB row stays (legacy never deletes it either).
export const cleanupExpiredNinetyOneDayMailVendorDocs = async () => {
  const cutoffDate = moment().subtract(NINETY_ONE_DAY_FILE_RETENTION_DAYS, 'days').format('YYYY-MM-DD');
  const rows = await EcourtMailvendorDocuments.findAll({
    attributes: ['caseId', 'documentName', 'documentFilePath'],
    where: {
      createdDate: cutoffDate,
      documentType: NINETY_ONE_DAY_DOCUMENT_TYPE,
      isMoved: '1',
      cmaId: NINETY_ONE_DAY_CMA_ID,
    },
    raw: true,
  });

  const basePath = getEfsBasePath();
  for (const row of rows) {
    if (!row.documentFilePath?.includes(`${row.caseId}_ALS_91-day`)) continue;
    const filePath = path.join(basePath, row.documentFilePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

// Skips the insert if a pending record already exists for this case (mirrors ExportBulkDoc.php:1126-1144).
export const queueNinetyOneDayMailVendorRecord = async (caseId, fileName, batchTimestamp, userId) => {
  const existing = await EcourtMailvendorDocuments.findOne({
    where: { caseId, isMoved: '0' },
    raw: true,
  });
  if (existing) return;

  await EcourtMailvendorDocuments.create({
    caseId,
    documentType: NINETY_ONE_DAY_DOCUMENT_TYPE,
    documentName: fileName,
    documentFilePath: buildNinetyOneDayRelativePath(fileName, batchTimestamp),
    noOfPages: NINETY_ONE_DAY_DOCUMENT_PAGES,
    cmaId: NINETY_ONE_DAY_CMA_ID,
    createdBy: userId || 0,
    createdDate: moment().format('YYYY-MM-DD'),
  });
};
