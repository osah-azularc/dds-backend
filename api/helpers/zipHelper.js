import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import archiver from 'archiver';
import { logger } from "../../config/winstonLogger.js";

// Compression level used when building ZIP archives
// Level 1 (fastest) — documents are already compressed, higher levels add time with negligible size benefit
const ZIP_COMPRESSION_LEVEL = 1;

/**
 * Create ZIP file from a source folder
 * @param {String} sourceDir   - Directory whose contents are zipped
 * @param {String} zipFilePath - Absolute path of the output .zip file
 * @returns {Promise<void>}
 */
export function createZipFile(sourceDir, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: ZIP_COMPRESSION_LEVEL },
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      logger.error(`[Download] Archive error: ${err.message}`);
      reject(err);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        logger.warn(`[Download] Archive warning: ${err.message}`);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);

    // Add all files/folders from the source directory
    const files = fsSync.readdirSync(sourceDir);

    files.forEach((file) => {
      const filePath = path.join(sourceDir, file);
      const stat = fsSync.statSync(filePath);

      if (stat.isDirectory()) {
        archive.directory(filePath, file);
      } else if (file !== path.basename(zipFilePath)) {
        archive.file(filePath, { name: file });
      }
    });

    archive.finalize();
  });
}

/**
 * Cleanup old ZIP files for a user (removes files older than 24 hours)
 * @param {String|Number} userId - User ID
 * @returns {Promise<void>}
 */
export async function cleanupOldZipFiles(userId) {
  const userUploadDir = path.join(process.cwd(), 'public', 'upload', String(userId));

  try {
    const files = await fs.readdir(userUploadDir);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.endsWith('.zip')) {
        const filePath = path.join(userUploadDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < oneDayAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch (error) {
    logger.warn(`[Download] Failed to cleanup old files: ${error.message}`);
  }
}

