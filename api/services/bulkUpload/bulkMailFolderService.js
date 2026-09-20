/**
 * Bulk Mail Folder Service
 *
 * Mirrors PHP ExportBulkDoc::generateBulkDocuments()'s manual clerk-pickup folder-drop:
 * file-storage/docs/{Bulkdocs|Clerkdocs}/{batchTimestamp}/{filename}.
 * Used by CSV bulk-import NOH generation (CSS EST, OIG EBT) so a clerk can find the
 * generated letters on the shared drive the same way they did in the legacy app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getEfsBasePath } from '../../utilities/efsPath.js';

const BULK_MAIL_FOLDERS = ['Bulkdocs', 'Clerkdocs'];

/**
 * Build a batch-timestamp folder name matching PHP's date("Y-m-d_H-is").
 * Call this once per import batch so every docket's letter lands in the same folder.
 */
export const generateBulkMailBatchTimestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

/**
 * Build the Bulkdocs/Clerkdocs filename, matching PHP's
 * "{caseid}_{templateNameWithoutExt}_{timestamp}{sk}.docx" pattern exactly, including the
 * trailing recipient index $sk concatenated with no separator. We generate one document per
 * docket rather than one per recipient, so recipientIndex defaults to 1 — the same index
 * legacy itself treats as "the" canonical copy (only sk===1 triggers its documentstable insert).
 * The embedded batch timestamp is what legacy relied on for uniqueness within the shared
 * folder — without it, a retry for the same docket would silently overwrite the first copy.
 *
 * @param {boolean} [isRespondentCopy=false] - PHP appends "_respondent" (before ".pdf") only
 *   to the Bulkdocs copy, only when this letter's addressee is party type "Respondent"
 *   (ExportBulkDoc.php:608-612). CSS EST's sole recipient is always Respondent; OIG EBT's
 *   canonical (sk=1) recipient is always Investigator, so this stays false there.
 */
export const buildBulkMailFileName = (caseId, templateDocumentName, batchTimestamp, { recipientIndex = 1, isRespondentCopy = false } = {}) => {
  const templateBaseName = templateDocumentName.replace(/\.docx$/i, '');
  const respondentSuffix = isRespondentCopy ? '_respondent' : '';
  return `${caseId}_${templateBaseName}_${batchTimestamp}${recipientIndex}${respondentSuffix}.pdf`;
};

const writePdfToFolder = (docsRoot, folderName, batchTimestamp, fileName, pdfBuffer) => {
  const targetDir = path.join(docsRoot, folderName, batchTimestamp);
  fs.mkdirSync(targetDir, { recursive: true });
  // Mirrors PHP's explicit chmod(0777) after mkdir() (ExportBulkDoc.php:180-183) — recursive
  // mkdirSync alone is subject to the process umask, which can leave the folder unwritable to
  // other OS users/processes that need it (e.g. clerk/print-vendor workflows). World-writable
  // is a known weakness (flagged by SonarQube S2612) but kept intentionally for exact legacy
  // parity — confirmed with the team, not an oversight. Do not "fix" this without re-checking.
  fs.chmodSync(targetDir, 0o777);
  fs.writeFileSync(path.join(targetDir, fileName), pdfBuffer);
};

const getDocsRoot = () => path.join(getEfsBasePath(), 'docs');

/**
 * Copy a generated PDF into the shared Bulkdocs/Clerkdocs folders for manual clerk pickup.
 * Legacy only appends "_respondent" to the Bulkdocs filename, never Clerkdocs — an asymmetry
 * we replicate exactly by accepting the two filenames separately.
 * @param {Buffer} pdfBuffer
 * @param {string} batchTimestamp - from generateBulkMailBatchTimestamp(), shared across the import batch
 * @param {Object} fileNames
 * @param {string} fileNames.bulkdocsFileName
 * @param {string} fileNames.clerkdocsFileName
 */
export const copyToBulkMailFolders = (pdfBuffer, batchTimestamp, { bulkdocsFileName, clerkdocsFileName }) => {
  const docsRoot = getDocsRoot();
  const fileNameByFolder = { Bulkdocs: bulkdocsFileName, Clerkdocs: clerkdocsFileName };
  for (const folderName of BULK_MAIL_FOLDERS) {
    writePdfToFolder(docsRoot, folderName, batchTimestamp, fileNameByFolder[folderName], pdfBuffer);
  }
};

/**
 * Copy a generated PDF into the Bulkdocs folder only — never Clerkdocs, never attached to the
 * docket. Mirrors PHP's per-recipient loop: every recipient (sk) gets a Bulkdocs copy
 * (ExportBulkDoc.php:857), but only sk===1 also gets a Clerkdocs copy + documentstable/
 * attachmentpaths insert (ExportBulkDoc.php:883-1019). Use this for the extra, untracked
 * recipient letters (e.g. OIG EBT's Respondent copy, sk=2) beyond the canonical sk=1 copy.
 * @param {Buffer} pdfBuffer
 * @param {string} fileName
 * @param {string} batchTimestamp
 */
export const copyToBulkdocsOnly = (pdfBuffer, fileName, batchTimestamp) => {
  writePdfToFolder(getDocsRoot(), 'Bulkdocs', batchTimestamp, fileName, pdfBuffer);
};
