/**
 * DFCS DHS Document Attachment Service
 *
 * Legacy: OsahformController::uploadDfcsMAction (osah.repos, lines ~9793-10049).
 * For every DFCS docket created during import, legacy searches the
 * configured DHS S3 bucket for documents DHS already dropped there for
 * that case (keyed by "{agencyRefNumber}_{caseType}/filename"), attaches any
 * matches to the docket (documentstable + attachmentpaths), and re-uploads each
 * one to a second bucket ('prod-file-scan-clamav') as a fire-and-forget hand-off
 * to an external antivirus-scan pipeline.
 *
 * Deliberate differences from legacy (confirmed with the team):
 * - Uses S3's native Prefix filter instead of listing the whole bucket and
 *   parsing keys client-side (legacy left the Prefix param empty).
 * - Non-fatal per document/per docket (log and continue) instead of legacy's
 *   exit() on the first failure, which would abort the entire CSV batch.
 * - Downloads straight to memory (Buffer) instead of legacy's local-temp-file
 *   round-trip; the same buffer is reused for the DB record and the
 *   scan-bucket re-upload. We never write it to the real EFS path ourselves —
 *   see the note on attachOneDocument below.
 */
import path from 'node:path';
import moment from 'moment';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';

// Same bucket, same credential fallback chain as dhsCsvListingService.js (kept
// independent here rather than sharing a module, since these are two separate
// features that happen to read the same external resource).
const SOURCE_BUCKET = process.env.DHS_CSV_S3_BUCKET;
const SCAN_BUCKET = process.env.CLAMAV_SCAN_S3_BUCKET || 'prod-file-scan-clamav';
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({ region: REGION });

// Modern replacement for legacy's SERVER_PORT-based $instanceId switch.
const INSTANCE_ID_BY_ENV = { dev: 4, stg: 3, stag: 3, uat: 2, prod: 1 };
export const getInstanceId = () => INSTANCE_ID_BY_ENV[(process.env.NODE_ENV || 'dev').toLowerCase()] ?? 0;

// Legacy prefixes the scan-bucket object key with an env folder (e.g. "eCourt-Dev/FORM 1.pdf")
// instead of uploading to the bucket root — the scan pipeline's S3 trigger/routing keys off
// this prefix, so it must be preserved or the Lambda never picks the object up.
const SCAN_KEY_PREFIX_BY_ENV = {
  dev: 'eCourt-Dev/', stg: 'eCourt-Stg/', stag: 'eCourt-Stg/', uat: 'eCourt-Uat/', prod: 'eCourt-Prod/',
};
export const getScanKeyPrefix = () => SCAN_KEY_PREFIX_BY_ENV[(process.env.NODE_ENV || 'dev').toLowerCase()] ?? '';

// Keyword classification, ported 1:1 from the legacy switch/keyword-match block.
const ADVERSE_ACTION_KEYWORDS = ['Termination', 'Denial', 'Overpayment', 'Review Warning', 'Renewal'];

export const classifyDocumentType = (fileName) => {
  // Legacy: explode(basename($key), '_')[0] — everything before the first underscore.
  const baseName = fileName.split('_')[0] || fileName;
  // Legacy's keyword check is case-insensitive (stripos); the FORM 1.pdf/Hearings
  // check below is an exact, case-sensitive PHP switch — preserved as-is.
  if (ADVERSE_ACTION_KEYWORDS.some((keyword) => baseName.toLowerCase().includes(keyword.toLowerCase()))) {
    return 'Adverse Action Letter';
  }
  if (baseName === 'FORM 1.pdf') return 'OSAH Form1 - initial docs';
  if (baseName === 'Hearings') return 'Hearing Request';
  return 'Other Documents';
};

/**
 * List every object under "{agencyRefNumber}_{caseType}/" in the source bucket.
 * S3-side Prefix filtering — legacy listed the entire bucket and filtered client-side.
 */
export const findMatchingDocumentKeys = async (agencyRefNumber, caseType) => {
  const prefix = `${agencyRefNumber}_${caseType}/`;
  const keys = [];
  let continuationToken;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: SOURCE_BUCKET,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }));
    for (const object of response.Contents || []) {
      if (!object.Key.endsWith('/')) keys.push(object.Key); // skip the folder placeholder itself
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
};

// Legacy never writes this file to EFS itself — the copy()/mkdir() calls that would have done
// so are commented out in uploadDfcsMAction (PHP lines ~9994-9998). The physical file at this
// path is written exactly once, by the external ClamAV worker, and only after a clean scan
// (yaml ~919-926: "/file-storage#{folder_path}#{file_name}"). We must not pre-write it
// ourselves — doing so would make a not-yet-scanned (possibly infected) file immediately
// servable at the real production document path, and an infected file would never get removed
// from disk since the reject path only deletes the DB rows (EfilingController.php:287-289).
const buildEfsAttachmentPath = (caseId, docType, timestamp, fileName) => {
  // Legacy: $fileuploadPath = $uploadFolder.$caseid."/".$doctype."/".$t."/" (folder only, single
  // trailing slash, no filename) — this exact string is what the scan worker's folder_path
  // metadata expects, since it does "/file-storage#{folder_path}#{file_name}" itself. Passing it
  // the full attachment path (filename already included) breaks that concatenation.
  const folderPath = `/upload/${caseId}/${docType}/${timestamp}/`;
  return {
    folderPath,
    // Legacy: $attachment_path = $fileuploadPath.$DocumentName — single slash, no filename doubling.
    attachmentPath: `${folderPath}${fileName}`,
  };
};

const attachOneDocument = async (caseId, key, dateRequested, userId) => {
  const rawFileName = path.basename(key);
  const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: SOURCE_BUCKET, Key: key }));
  const buffer = Buffer.from(await getResponse.Body.transformToByteArray());

  // Classification uses the original name, but legacy renames the file before storing/
  // uploading it anywhere else: $finalFileName = date('mdyHis').'_'.basename($object_key)
  // (PHP line 9929) — used for DocumentName, the attachment path, the scan-bucket key, and
  // the file_name metadata tag.
  const docType = classifyDocumentType(rawFileName);
  const storedFileName = `${moment().format('MMDDYYHHmmss')}_${rawFileName}`;
  const timestamp = moment().format('MMDDYYYYHHmmss');
  const { folderPath, attachmentPath } = buildEfsAttachmentPath(caseId, docType, timestamp, storedFileName);

  const now = new Date();
  // Wrap both inserts in one transaction — without it, an AttachmentPathsModel failure after
  // DocumentsTable.create succeeds would orphan a documentstable row forever (stuck at
  // is_scanned='0', no attachment path, invisible to the scan-status cron).
  const docRecord = await mysqlSequelize.transaction(async (transaction) => {
    const doc = await DocumentsTable.create({
      caseId,
      documentType: docType,
      dateRequested,
      description: '',
      documentName: storedFileName,
      docketCaseId: caseId,
      docFileFlage: 1, // legacy sets '1' here (vs. NOH's 0) — this document arrived pre-attached, not user-uploaded
      isScanned: '0', // legacy marks not-yet-scanned; the clamav-bucket upload below is the hand-off for scanning
      createdBy: userId,
      createdDate: now,
      modifiedDate: now,
    }, { transaction });
    await AttachmentPathsModel.create({ documentId: doc.documentId, attachmentPath }, { transaction });
    return doc;
  });

  // Fire-and-forget hand-off to the external antivirus-scan pipeline — matches legacy's
  // $s3BucketData metadata tags exactly. Not awaited-on for a scan result, same as legacy.
  // The scan worker (not us) writes the clean file to the real EFS path once it passes.
  await s3Client.send(new PutObjectCommand({
    Bucket: SCAN_BUCKET,
    Key: `${getScanKeyPrefix()}${storedFileName}`,
    Body: buffer,
    ACL: 'private',
    Metadata: {
      caseid: String(caseId),
      docid: String(docRecord.documentId),
      created_by: String(userId),
      folder_path: folderPath,
      file_addedfrom: 'ecourt',
      instance_id: String(getInstanceId()),
      file_name: storedFileName,
    },
  }));

  return docType;
};

/**
 * Attach every DHS document matching this docket's agency ref number + case type.
 * Call this AFTER the docket's own transaction has committed — a document failing
 * to download/attach must never roll back an already-successful docket/party
 * creation. Every document is independent and non-fatal: one bad file is logged
 * and skipped, the rest of the batch (and the rest of this docket's documents)
 * still proceeds.
 *
 * Returns foundDocTypes alongside the counts so the caller can reproduce legacy's
 * "which required document types are missing" CSV report (OsahformController.php:10069-10210).
 */
export const attachDhsDocumentsToDocket = async (caseId, agencyRefNumber, caseType, dateRequested, userId) => {
  let attachedCount = 0;
  let failedCount = 0;
  const foundDocTypes = new Set();

  let keys;
  try {
    keys = await findMatchingDocumentKeys(agencyRefNumber, caseType);
  } catch (error) {
    logger.error('DHS document lookup failed:', { caseId, agencyRefNumber, caseType, error: error.message });
    return { attachedCount, failedCount, foundDocTypes };
  }

  for (const key of keys) {
    try {
      const docType = await attachOneDocument(caseId, key, dateRequested, userId);
      attachedCount += 1;
      foundDocTypes.add(docType);
    } catch (error) {
      failedCount += 1;
      logger.error('DHS document attachment failed:', { caseId, key, error: error.message });
    }
  }

  return { attachedCount, failedCount, foundDocTypes };
};
