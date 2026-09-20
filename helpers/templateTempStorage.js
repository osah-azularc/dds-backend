
import { promises as fsp } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------


export const TEMP_DIR = path.join(process.cwd(), 'tmp', 'templates');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the temp directory exists.
 * Safe to call on every upload; mkdir is a no-op when the dir already exists.
 *
 * @returns {Promise<void>}
 */
const ensureTempDir = async () => {
  await fsp.mkdir(TEMP_DIR, { recursive: true });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------


export const saveTempFile = async (fileBuffer, originalFileName) => {
  await ensureTempDir();

  // Use the original filename directly instead of UUID
  const tempId = originalFileName;
  const absolutePath = path.join(TEMP_DIR, originalFileName);

  await fsp.writeFile(absolutePath, fileBuffer);

  return { tempId, originalFileName, absolutePath };
};


export const getTempFilePath = (tempId) =>
  path.join(TEMP_DIR, tempId);

export const deleteTempFile = async (tempId) => {
  const filePath = getTempFilePath(tempId);
  await fsp.unlink(filePath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
};

