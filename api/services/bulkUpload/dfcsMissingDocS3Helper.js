import path from 'node:path';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { classifyDocumentType } from './dfcsDocumentAttachmentService.js';

/**
 * DFCS Missing Documents — DHS S3 Document Matching Helper
 * Created by: Rizwan Hiroli
 *
 * Looks up the per-case document folder DHS drops in the forms S3 bucket
 * (objects keyed `{agencyRefNumber}_{caseType}/...`) and classifies each
 * object by filename, reusing classifyDocumentType from
 * dfcsDocumentAttachmentService.js (same bucket, same filename convention —
 * don't reimplement the keyword/switch logic here).
 * Legacy: OsahformController::uploadDfcsMissingDocAction.
 *
 * Deliberate deviation from legacy: the PHP action paginates the *entire*
 * bucket on every CSV row and filters client-side by agency ref/case type.
 * This queries S3 directly with `Prefix: "{agencyRefNumber}_{caseType}/"`,
 * since the bucket is already laid out per-case — same result, no full
 * bucket walk per row.
 *
 * Reuses the same env vars as dhsCsvListingService.js (same bucket/creds).
 */

const BUCKET_NAME = process.env.DHS_CSV_S3_BUCKET;
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({ region: REGION });

// The two document types the legacy report always calls out by name when absent.
export const REQUIRED_DOCUMENT_TYPES = ['Adverse Action Letter', 'Hearing Request'];

export const NO_DOCUMENTS_FOUND_MESSAGE =
  'Some Documents Folders were not found on S3 bucket for given Agency Ref Number and Case Type Combination.';

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * List and download every object under the case's own S3 folder,
 * classifying each by filename.
 * @returns {Promise<Array<{ documentType: string, fileName: string, buffer: Buffer }>>}
 */
export async function findMatchingDocuments(agencyRefNumber, caseType) {
  const prefix = `${agencyRefNumber}_${caseType}/`;
  const matches = [];
  let continuationToken;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }));

    for (const object of response.Contents || []) {
      if (object.Key.endsWith('/')) continue; // skip folder placeholder keys

      const getObjectResponse = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: object.Key,
      }));
      const buffer = await streamToBuffer(getObjectResponse.Body);
      const fileName = path.basename(object.Key);
      matches.push({ documentType: classifyDocumentType(fileName), fileName, buffer });
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return matches;
}

/**
 * Determine which required document types are absent from the matched set.
 */
export function getMissingRequiredDocumentTypes(foundDocumentTypes) {
  return REQUIRED_DOCUMENT_TYPES.filter((type) => !foundDocumentTypes.includes(type));
}

/**
 * Build the human-readable "missing document" message for the error report.
 * Legacy names the exact missing type(s); this keeps that behavior with
 * clearer grammar than the original concatenation.
 */
export function buildMissingDocumentMessage(missingTypes) {
  const label = missingTypes.length > 1 ? 'documents were' : 'document was';
  return `${missingTypes.join(', ')} ${label} not found on S3 bucket for given Agency Ref Number and Case Type Combination.`;
}
