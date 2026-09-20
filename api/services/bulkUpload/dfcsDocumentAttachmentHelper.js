import path from 'node:path';
import moment from 'moment';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { getUploadRoot } from '../../helpers/docketDetail/storagePathUtils.js';
import { getInstanceId, getScanKeyPrefix } from './dfcsDocumentAttachmentService.js';
import { logger } from '../../../config/winstonLogger.js';

/**
 * DFCS Missing Documents — Document Attachment Helper
 * Created by: Rizwan Hiroli
 *
 * Persists a matched DHS S3 document to documentstable + attachmentpaths and
 * hands the file off to the same ClamAV "pending scan" S3 bucket as the DFCS
 * import flow (dfcsDocumentAttachmentService.js) — never writes it to the
 * real, servable storage path itself. The external scan worker writes the
 * clean file to that path only after a clean scan; writing it ourselves here
 * would make a not-yet-scanned (possibly infected) DHS-provided file
 * immediately downloadable, with no cleanup path if it turns out infected
 * (see dfcsDocumentAttachmentService.js's module doc for the full rationale —
 * this mirrors that exactly rather than diverging from it).
 */

// Same bucket/region/credential fallback chain as dfcsDocumentAttachmentService.js — kept
// independent rather than exported from there, since that module scopes its S3 client to the
// DFCS import flow's own read (SOURCE_BUCKET) + write (SCAN_BUCKET) pair.
const SCAN_BUCKET = process.env.CLAMAV_SCAN_S3_BUCKET || 'prod-file-scan-clamav';
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({ region: REGION });

/**
 * Attach a matched document to a docket, unless a document of the same
 * type is already attached to it (dedupe, matches legacy's uploadDocFlag
 * check).
 * @returns {Promise<boolean>} true if a new document record was created
 */
export async function attachDocumentIfNew(caseId, { documentType, fileName, buffer }, rowData, userId) {
  const alreadyAttached = await DocumentsTable.findOne({
    where: { caseId, documentType },
    attributes: ['documentId'],
  });
  if (alreadyAttached) return false;

  // Same rename convention as dfcsDocumentAttachmentService.js — used for the DB record, the
  // scan-bucket key, and the folder_path/file_name metadata the scan worker keys off of.
  const storedFileName = `${moment().format('MMDDYYHHmmss')}_${path.basename(fileName)}`;
  const folderPath = `${getUploadRoot()}/${caseId}/${documentType}/${Date.now()}/`.replace(/\/{2,}/g, '/');

  const transaction = await mysqlSequelize.transaction();
  let docRecord;
  try {
    docRecord = await DocumentsTable.create({
      caseId,
      documentType,
      dateRequested: rowData.dateReceived,
      description: '',
      documentName: storedFileName,
      docketCaseId: caseId,
      docFileFlage: 1,
      isScanned: '0', // not yet virus-scanned — the ClamAV worker flips this after a clean scan
      createdBy: userId,
      createdDate: new Date(),
    }, { transaction });

    await AttachmentPathsModel.create({
      documentId: docRecord.documentId,
      attachmentPath: `${folderPath}${storedFileName}`,
    }, { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    logger.error('Error in dfcsDocumentAttachmentHelper.attachDocumentIfNew:', { error: error.message, stack: error.stack });
    return false;
  }

  // Fire-and-forget hand-off to the external antivirus-scan pipeline, same target bucket and
  // metadata shape as dfcsDocumentAttachmentService.js. The DB record is already committed at
  // this point — unlike that sibling, this flow's caller has no per-document try/catch of its
  // own, so a scan-upload failure is swallowed here rather than thrown: the document is still
  // legitimately attached, it just risks staying unscanned longer, which is non-fatal and gets
  // logged for follow-up.
  try {
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
  } catch (error) {
    logger.error('DFCS missing-doc scan hand-off failed:', { caseId, documentId: docRecord.documentId, error: error.message });
  }

  return true;
}
