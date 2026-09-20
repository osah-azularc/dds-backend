import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { PDFDocument } from 'pdf-lib';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import EcourtMailvendorDocuments from '../../models/EcourtMailvendorDocuments.js';
import Docket from '../../models/Docket.js';
import { getEfsBasePath } from '../../utilities/efsPath.js';

// Mirrors PHP: ZipArchive → docProps/app.xml → Pages count.
// Uses pdf-lib instead of reading the DOCX ZIP because we have the PDF buffer in hand.
async function countPdfPages(pdfBuffer) {
  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}


/**
 * Build the CMA (judge assistant) mail-vendor folder name from "Lastname Firstname"
 * (the format judgeassistant is stored in), matching legacy's own split logic
 * (OsahDbDocumentTemplate.php: $firstn/$lasttn via stripos/substr on the first space),
 * net result "Firstname_Lastname" after legacy's own trim() before using it as a folder name.
 */
export const buildCmaFolderName = (judgeAssistant) => {
  const name = (judgeAssistant || '').trim();
  if (!name) return 'Unassigned';
  const spaceIdx = name.indexOf(' ');
  if (spaceIdx === -1) return name;
  const lastName = name.slice(0, spaceIdx);
  const firstName = name.slice(spaceIdx + 1);
  return `${firstName}_${lastName}`.trim();
};

/**
 * Physically copy the PDF into the shared CMA-name mail-vendor folder and return the
 * document_file_path value to store. Mirrors PHP's own extra copy() into
 * {automationPath}/{cmaName}/{mailVendorFolderName}/{filename} (OsahDbDocumentTemplate.php:1392),
 * a folder distinct from — and in addition to — the canonical documentstable/attachmentpaths copy.
 */
const writeCmaMailVendorCopy = (pdfBuffer, cmaFolderName, docName) => {
  const dateFolder = moment().format('MM-DD-YYYY');
  const targetDir = path.join(getEfsBasePath(), 'automation', cmaFolderName, dateFolder);
  fs.mkdirSync(targetDir, { recursive: true });
  // World-writable to match legacy's explicit chmod(0777) for shared clerk/vendor access —
  // see the identical, team-confirmed tradeoff documented in bulkMailFolderService.js.
  fs.chmodSync(targetDir, 0o777);
  const filePath = path.join(targetDir, docName);
  fs.writeFileSync(filePath, pdfBuffer);

  // Verify the copy actually landed before the caller trusts it enough to replace the DB
  // row that points the mail-vendor cron at the old, still-good copy.
  const written = fs.statSync(filePath);
  if (written.size === 0) {
    throw new Error(`Mail vendor copy for ${docName} was written but is empty (0 bytes)`);
  }

  return `/automation/${cmaFolderName}/${dateFolder}/${docName}`;
};

/**
 * Insert a record into ecourt_mailvendor_documents for mail vendor processing.
 * Mirrors PHP generateDocumentTemplate mail vendor block (flag="1" && MVAddFileCondition==1).
 * Called AFTER the DB transaction commits — non-fatal, cron picks it up later for SFTP.
 *
 * PHP also deletes prior unprocessed records for the same case before inserting.
 *
 * document_file_path is the CMA-name-based mail-vendor copy (see writeCmaMailVendorCopy),
 * matching legacy's own folder structure — NOT the canonical documentstable/attachmentpaths
 * location (s3Key), which is untouched and still used by the Docket Detail page. If pdfBuffer
 * is unavailable a physical copy can't be written, so this falls back to s3Key.
 *
 * @param {number}        caseid    - Docket case ID
 * @param {string}        docType   - Document type label (e.g. 'NOH')
 * @param {string}        docName   - PDF file name
 * @param {string}        s3Key     - EFS/S3 path stored in attachmentpaths (document_file_path)
 * @param {number|null}   cmaId     - publicaccess_users.user_id of the CMA (null if unavailable)
 * @param {number}        userId    - Logged-in user's numeric ID (created_by)
 * @param {Buffer|null}   pdfBuffer - Generated PDF buffer; also used to count pages (mirrors PHP ZIP read)
 */
export const saveMailVendorRecord = async (caseid, docType, docName, s3Key, cmaId, userId, pdfBuffer = null) => {
  const noOfPages = pdfBuffer ? await countPdfPages(pdfBuffer) : 0;

  // Create (and verify) the new mail-vendor copy BEFORE touching the DB row — if this fails,
  // the previous pending job for this case is left untouched and still gets picked up by cron.
  let documentFilePath = s3Key;
  if (pdfBuffer) {
    const docket = await Docket.findOne({ where: { caseId: caseid }, attributes: ['judgeAssistant'], raw: true });
    const cmaFolderName = buildCmaFolderName(docket?.judgeAssistant);
    documentFilePath = writeCmaMailVendorCopy(pdfBuffer, cmaFolderName, docName);
  }

  // Replace the old pending row with the new one atomically — a failed insert rolls back the
  // delete too, so a still-valid prior job is never left deleted with nothing to replace it.
  const t = await mysqlSequelize.transaction();
  try {
    await EcourtMailvendorDocuments.destroy({ where: { caseId: caseid, isMoved: '0' }, transaction: t });
    await EcourtMailvendorDocuments.create(
      {
        caseId: caseid,
        documentType: docType || '',
        documentName: docName,
        documentFilePath,
        noOfPages,
        cmaId: cmaId || null,
        createdBy: userId || 0,
        createdDate: moment().format('YYYY-MM-DD'),
      },
      { transaction: t },
    );
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
