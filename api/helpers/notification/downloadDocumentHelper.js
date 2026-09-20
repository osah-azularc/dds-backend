import { AttachmentPaths } from '../../models/index.js';
import ExternalDocuments from "../../models/ExternalDocuments.js";
import { logger } from "../../../config/winstonLogger.js";

const KNOWN_STORAGE_PREFIX_PATTERN = /^(?:upload|eCourt-Dev|eCourt-Stg|eCourt-Uat|eCourt-Prod)(?:\/|$)/i;

// Legacy per-environment folders (retired) — strip them off old stored paths so they
// resolve to the same, single production-style '/upload/...' path as everything else.
const LEGACY_ENV_UPLOAD_PREFIX_PATTERN = /^(?:DEV-Data|STG-Data|UAT-Data)(?:\/|$)/i;

/**
 * Download document - Returns file path for both regular and e-filing documents
 * Matches PHP /Osahform/downloaddocument behavior:
 *   SELECT attachmentpath FROM attachmentpaths WHERE documentid = $id
 *
 * @param {number} documentId - Document ID to download
 * @returns {Promise<string>} File path or '0' if not found
 */
const downloadDocument = async (documentId) => {
  try {
    if (!documentId) {
      return '0';
    }

    // 1. Look up attachmentpaths directly (matches PHP downloaddocumentAction)
    const attachmentRow = await AttachmentPaths.findOne({
      where: { documentId },
      attributes: ['attachmentPath'],
      raw: true,
    });

    if (attachmentRow?.attachmentPath) {
      const webPath = constructFilePath(attachmentRow.attachmentPath);
      return webPath;
    }

    // 2. Fallback to e-filing documents (matches Angular notification flow,
    //    which called efiling/is-file-exists when Osahform/downloaddocument returned '0')
    const efilingDocument = await ExternalDocuments.findOne({
      where: { documentId },
      attributes: ["documentId", "documentName", "documentFilePath"],
      raw: true,
    });

    if (efilingDocument?.documentFilePath) {
      return efilingDocument.documentFilePath;
    }

    // 3. Not found in either table - return '0'
    return '0';
  } catch (error) {
    logger.error("Error in downloadDocument service:", { error: error.message, stack: error.stack });
    return '0';
  }
};

/**
 * Construct file path, always in the production layout (single '/upload/...' root,
 * no per-environment folder).
 *
 * @param {string} attachmentPath - Attachment path from database
 * @returns {string} Constructed web path (e.g. "/upload/...")
 */
const constructFilePath = (attachmentPath) => {
  if (!attachmentPath) {
    return '';
  }

  // 1) Drop protocol + host if a full URL was stored (http://stg-data/..., https://...)
  let webPath = String(attachmentPath).replace(/^https?:\/\/[^/]+/i, '');

  // 2) Remove any "/file-storage" segment from the path
  webPath = webPath.replace(/\/file-storage/gi, '');

  // 3) Normalize: remove leading slashes so we can safely prepend
  webPath = webPath.replace(/^\/+/, '');

  // 4) Strip a legacy per-environment prefix (DEV-Data/STG-Data/UAT-Data) so old stored
  // paths resolve to the same production-style path as everything else.
  webPath = webPath.replace(LEGACY_ENV_UPLOAD_PREFIX_PATTERN, '');

  // 5) If the path already carries a known storage prefix, return it as-is.
  if (KNOWN_STORAGE_PREFIX_PATTERN.test(webPath)) {
    return `/${webPath}`;
  }

  return `/upload/${webPath}`;
};

export default downloadDocument;
