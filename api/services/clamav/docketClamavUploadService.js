import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { getUploadRoot } from '../../helpers/docketDetail/storagePathUtils.js';
import { getInstanceId, getScanKeyPrefix } from '../bulkUpload/dfcsDocumentAttachmentService.js';
import { logger } from '../../../config/winstonLogger.js';

/**
 * Docket "+ Files" upload — hand-off into the existing (unchanged) ClamAV pipeline.
 * Created for the Docket Detail "+ Files" CTA.
 *
 * Owns ONLY: documentstable + attachmentpaths creation, and the S3 hand-off to the
 * existing prod-file-scan-clamav bucket with the metadata contract the Ruby S3
 * event -> SQS -> EC2 ClamAV worker already expects. The worker (unchanged) owns
 * download/scan/EFS-write/clamav_scan_status — none of that is duplicated here.
 *
 * getInstanceId()/getScanKeyPrefix() are reused directly from the DFCS bulk-attach
 * service (they are generic env/instance mapping, not DFCS business logic); the
 * SCAN_BUCKET fallback constant is intentionally kept local, mirroring the same
 * independent-copy choice already made by dfcsDocumentAttachmentService.js and
 * dfcsDocumentAttachmentHelper.js.
 */
const SCAN_BUCKET = process.env.CLAMAV_SCAN_S3_BUCKET || 'prod-file-scan-clamav';
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({ region: REGION });

const sanitizeFileName = (name) => String(name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');

async function cleanupOrphanedDocument(documentId, originalError) {
  try {
    await AttachmentPathsModel.destroy({ where: { documentId } });
    await DocumentsTable.destroy({ where: { documentId } });
  } catch (cleanupError) {
    logger.error('Failed to clean up docket document after ClamAV hand-off failure:', {
      documentId,
      cleanupError: cleanupError.message,
      originalError: originalError.message,
    });
  }
}

/**
 * Create the docket file record and hand it off to the existing ClamAV scan bucket.
 * Resolves only after the S3 hand-off succeeds; on hand-off failure the just-created
 * documentstable/attachmentpaths rows are removed so no permanently-orphaned
 * "pending scan" record is left behind, and the error is rethrown.
 */
export async function uploadDocketFileToClamav({
  caseId,
  documentType,
  dateFiled,
  description,
  isSealed,
  createdBy,
  file,
}) {
  const documentName = sanitizeFileName(file.originalname);
  const folderPath = `${getUploadRoot()}/${caseId}/${documentType}/${Date.now()}/`;
  const now = new Date();

  const docRecord = await mysqlSequelize.transaction(async (transaction) => {
    const doc = await DocumentsTable.create({
      caseId,
      documentType,
      dateRequested: dateFiled,
      description: description || '',
      documentName,
      docketCaseId: caseId,
      docFileFlage: 1,
      isScanned: '0',
      isSealed,
      createdBy,
      createdDate: now,
      modifiedDate: now,
    }, { transaction });

    await AttachmentPathsModel.create({
      documentId: doc.documentId,
      attachmentPath: `${folderPath}${documentName}`,
    }, { transaction });

    return doc;
  });

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: SCAN_BUCKET,
      Key: `${getScanKeyPrefix()}${documentName}`,
      Body: file.buffer,
      ACL: 'private',
      Metadata: {
        caseid: String(caseId),
        docid: String(docRecord.documentId),
        created_by: String(createdBy),
        folder_path: folderPath,
        file_addedfrom: 'ecourt',
        instance_id: String(getInstanceId()),
        file_name: documentName,
      },
    }));
  } catch (error) {
    await cleanupOrphanedDocument(docRecord.documentId, error);
    throw error;
  }

  return docRecord;
}
