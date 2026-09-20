import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * @module invoiceAttachmentS3Helper
 * @author Rizwan Hiroli
 * @date 2026-09-02
 * @description
 * Invoice Listing's paperclip/"Attach Files" feature - its own small, independent S3
 * integration. Deliberately NOT built on the shared `helpers/s3.js` (used by many unrelated
 * features - case documents, case initiation, template files, bulk email) after a real incident
 * today where an unrelated change to that shared file silently broke attachment downloads for
 * everyone using it. This file owns exactly one bucket for exactly one feature, so nothing else
 * can break it and it can't break anything else.
 *
 * The bucket name is hardcoded, not env-driven - `osah-timekeeping` is the one and only bucket
 * this feature has ever used (matches legacy's own hardcoded `'Bucket' => 'osah-timekeeping'` in
 * InvoicesController.php, and InvoiceAttachment.js's own column comment). An env-var-driven bucket
 * name was tried first and reverted: a blank/unset env var silently breaks every call (confirmed
 * live 2026-09-02 - see the S3_BUCKET_NAME investigation), and this feature never needs more than
 * one bucket, so there's nothing an env var actually needs to vary.
 *
 * Does NOT run the ClamAV pre-upload scan `helpers/s3.js`'s `uploadFile` offers (`scanFile`
 * option) - not a gap against legacy, which never scanned invoice attachments either
 * (InvoicesController::addFileAction uploads straight to S3, no antivirus call at all); this
 * matches that exactly. A brief attempt to add scanning here anyway (2026-08-27, beyond what
 * legacy or the spec called for) didn't actually work on this branch - the scan's own worker
 * script (`clamavWorker.js`) doesn't exist in this checkout (it lives on a separate, unmerged
 * branch, `origin/feature/dev/clamav-v0`), confirmed live: calling it always rejected with
 * "Cannot find module ...clamavWorker.js" before ever reaching S3, breaking every upload. If
 * scanning is ever wanted as a genuine improvement over legacy, that branch would need to merge
 * first - not something owed by this file.
 */

const BUCKET_NAME = "osah-timekeeping";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const environment = process.env.NODE_ENV || "local";

// A fresh upload always gets a new, environment-scoped key built here - so a fresh upload's own
// write and read always agree (this module always resolves its own freshly-built keys as-is,
// see resolveStorageKey below).
const buildEnvironmentScopedKey = (key) => `${environment}/${key}`;

// Legacy's own addFileAction bakes one of these four literal prefixes directly into the key it
// stores (InvoicesController.php, chosen from the PHP server's own port) - a legacy-origin row's
// filepath already has one of these baked in, and must be used as-is, never re-prefixed.
const LEGACY_ENV_PREFIXES = ["eCourt-Dev/", "eCourt-Stg/", "eCourt-Uat/", "eCourt-Prod/"];

/**
 * Resolves a DB-stored `invoice_attachments.filepath` to the real, complete S3 key to request -
 * without ever stacking a second prefix on top of one that's already there. Handles all three
 * shapes a real row can have: a legacy-origin key (already complete, one of LEGACY_ENV_PREFIXES),
 * a key this module itself wrote (already complete, prefixed with this environment's own name),
 * or a bare relative key with no prefix at all (an older row from before this module existed) -
 * only that last shape gets this environment's prefix added on read.
 * @param {string} filepath - the raw value from invoice_attachments.filepath
 * @returns {string} the real, complete S3 key
 */
const resolveStorageKey = (filepath) => {
  const alreadyComplete =
    filepath.startsWith(`${environment}/`) || LEGACY_ENV_PREFIXES.some((prefix) => filepath.startsWith(prefix));
  return alreadyComplete ? filepath : buildEnvironmentScopedKey(filepath);
};

/**
 * @description Whether an object exists at the given (already-resolved) complete key.
 */
const doesInvoiceAttachmentExist = async (completeKey) => {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: completeKey }));
    return true;
  } catch {
    return false;
  }
};

/**
 * @description
 * Uploads a new attachment. Builds and returns the COMPLETE key actually written (environment
 * prefix included) - callers must store this exact returned value as invoice_attachments.filepath,
 * not the bare key passed in, so a future read never has to guess whether a stored filepath
 * already has a prefix baked in.
 * @param {Buffer} fileContent
 * @param {string} bareKey - e.g. `timekeeping/invoice_attachments/<invoiceId>/<uuid>.pdf`
 * @returns {Promise<string>} the complete S3 key that was actually written
 */
const uploadInvoiceAttachment = async (fileContent, bareKey) => {
  const completeKey = buildEnvironmentScopedKey(bareKey);
  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: completeKey, Body: fileContent }),
  );
  return completeKey;
};

/**
 * @description Reads an attachment back by its stored filepath. Returns null if the object
 * can't be found (never throws for a plain not-found - matches this feature's own "This
 * attachment's file could not be found" 404 branch).
 * @param {string} storedFilepath - the verbatim invoice_attachments.filepath value
 * @returns {Promise<import('stream').Readable|null>}
 */
const getInvoiceAttachment = async (storedFilepath) => {
  const completeKey = resolveStorageKey(storedFilepath);
  if (!(await doesInvoiceAttachmentExist(completeKey))) return null;
  const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: completeKey }));
  return response.Body;
};

/**
 * @description Deletes an attachment's S3 object. A no-op (not an error) if it's already gone.
 * @param {string} storedFilepath - the verbatim invoice_attachments.filepath value
 */
const deleteInvoiceAttachment = async (storedFilepath) => {
  const completeKey = resolveStorageKey(storedFilepath);
  if (!(await doesInvoiceAttachmentExist(completeKey))) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: completeKey }));
};

export {
  BUCKET_NAME,
  uploadInvoiceAttachment,
  getInvoiceAttachment,
  deleteInvoiceAttachment,
  doesInvoiceAttachmentExist,
  resolveStorageKey,
};
