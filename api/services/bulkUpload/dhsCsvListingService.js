import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import DhsClerkCsvListingScreen from '../../models/DhsClerkCsvListingScreen.js';

/**
 * DHS CSV Listing Service
 * Created by: Rizwan Hiroli
 *
 * Lists and downloads the source CSV files DHS drops into their S3 bucket,
 * merged with clerk review status/notes tracked in dhs_clerk_csv_listing_screen.
 * Legacy: OsahformController::getAwsCsvObjectsListBucketAction / dwnldAwsCsvObjctsFrmBcktAction
 */

const BUCKET_NAME = process.env.DHS_CSV_S3_BUCKET;
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({ region: REGION });

function formatLastModified(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

// Mirrors the scope `fetchAllCsvObjects` exposes via listing (Delimiter: '/',
// .csv suffix only): a bare top-level key with no path separators, ending in
// .csv. Anything else (nested keys, other extensions, arbitrary bucket
// objects) is rejected before it ever reaches S3.
const TOP_LEVEL_CSV_KEY_PATTERN = /^[^/\\]+\.csv$/i;

function isValidTopLevelCsvKey(fileName) {
  return typeof fileName === 'string' && TOP_LEVEL_CSV_KEY_PATTERN.test(fileName);
}

class DhsCsvListingService {
  /**
   * Paginate through the DHS bucket (top level only) and collect CSV file metadata
   */
  async fetchAllCsvObjects() {
    const csvFiles = [];
    let continuationToken;

    do {
      const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: '',
        Delimiter: '/',
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }));

      for (const object of response.Contents || []) {
        if (object.Key.toLowerCase().endsWith('.csv')) {
          csvFiles.push({
            fileName: object.Key,
            lastModifiedDate: formatLastModified(object.LastModified),
            timestamp: object.LastModified.getTime(),
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return csvFiles;
  }

  /**
   * List all CSV files in the DHS bucket, newest first, merged with clerk review status
   */
  async listCsvObjects() {
    const csvFiles = await this.fetchAllCsvObjects();
    csvFiles.sort((a, b) => b.timestamp - a.timestamp);

    const storedRows = await DhsClerkCsvListingScreen.findAll({ raw: true });
    const storedByFilename = new Map(storedRows.map((row) => [row.fileName, row]));

    return csvFiles.map(({ fileName, lastModifiedDate }) => {
      const stored = storedByFilename.get(fileName);
      return {
        fileName,
        lastModifiedDate,
        id: stored?.id ?? '',
        status: stored?.status ?? '0',
        notes: stored?.notes ?? '',
        createdDate: stored?.createdDate ?? '',
        updatedDate: stored?.updatedDate ?? '',
      };
    });
  }

  /**
   * Get a readable stream for a CSV file from the DHS S3 bucket.
   * Only accepts a bare top-level *.csv key — the same scope listCsvObjects()
   * exposes — so callers can't request nested keys or non-CSV objects from
   * the bucket by passing an arbitrary fileName.
   */
  async getCsvObjectStream(fileName) {
    if (!isValidTopLevelCsvKey(fileName)) {
      const error = new Error('Invalid or disallowed DHS CSV file name.');
      error.code = 'INVALID_FILE_NAME';
      throw error;
    }

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    }));
    return response.Body;
  }

  /**
   * Upsert notes and status for a DHS CSV file in dhs_clerk_csv_listing_screen.
   * status values: '0' = Pending, '1' = Reviewed
   */
  async upsertCsvListing(fileName, status, notes) {
    const existing = await DhsClerkCsvListingScreen.findOne({ where: { fileName } });
    if (existing) {
      await existing.update({ status, notes, updatedDate: new Date() });
      return existing;
    }
    return DhsClerkCsvListingScreen.create({
      fileName,
      status,
      notes,
      createdDate: new Date(),
      updatedDate: new Date(),
    });
  }
}

export default new DhsCsvListingService();
