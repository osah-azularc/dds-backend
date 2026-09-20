import fs from 'fs';
import path from 'path';
import { logger } from '../../config/winstonLogger.js';

/**
 * Sanitize filename to prevent directory traversal attacks
 * - Extracts base filename (removes path components like ../ or C:\)
 * - Removes dangerous characters
 * - Generates unique prefix to prevent collisions
 * @param {string} originalname - The original filename from the upload
 * @returns {string} Sanitized filename
 */
export const sanitizeFilename = (originalname) => {
  // Extract just the base filename (handles both Unix and Windows paths)
  const baseName = path.basename(originalname);
  // Remove any remaining dangerous characters (keep only alphanumeric, dash, underscore, dot)
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Add timestamp prefix to ensure uniqueness and prevent overwriting
  return `${Date.now()}_${sanitized}`;
};

// Root directory that bounds all bulk-upload cleanup operations.
// Any basePath passed to removeOldFiles must resolve inside this root.
const UPLOADS_ROOT = path.resolve('./uploads');

/**
 * Verify that a candidate path is contained within UPLOADS_ROOT.
 * Prevents a misconfigured UPLOAD_PATH (e.g. '/' or 'C:\\') from triggering
 * destructive recursive deletes outside the intended uploads directory.
 * @param {string} candidate - Path to validate
 * @returns {boolean} True if candidate is inside UPLOADS_ROOT
 */
const isInsideUploadsRoot = (candidate) => {
  const resolved = path.resolve(candidate);
  return resolved === UPLOADS_ROOT || resolved.startsWith(UPLOADS_ROOT + path.sep);
};

/**
 * Remove old files/folders older than specified days
 * @param {string} basePath - Base directory path (must resolve inside ./uploads)
 * @param {number} days - Number of days threshold
 */
export const removeOldFiles = async (basePath, days = 3) => {
  try {
    if (!basePath || !isInsideUploadsRoot(basePath)) {
      logger.error('removeOldFiles: refusing to operate outside uploads root', {
        basePath,
        uploadsRoot: UPLOADS_ROOT,
      });
      return;
    }

    if (!fs.existsSync(basePath)) {
      return;
    }

    const now = Date.now();
    const threshold = days * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    const items = fs.readdirSync(basePath);

    for (const item of items) {
      const itemPath = path.join(basePath, item);
      const stats = fs.statSync(itemPath);

      // Check if older than threshold
      if (now - stats.mtimeMs > threshold) {
        if (stats.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
          logger.info(`Removed old directory: ${itemPath}`);
        } else {
          fs.unlinkSync(itemPath);
          logger.info(`Removed old file: ${itemPath}`);
        }
      }
    }
  } catch (error) {
    logger.error('Error removing old files:', { error: error.message, stack: error.stack });
  }
};