import fs from 'node:fs';
import path from 'node:path';
import { resolveStorageAbsolutePath } from './storagePathUtils.js';

export async function handleDocumentDownload(attachmentPath, forceDownloadFlag) {
  try {
    const { normalizedPath, absolutePath } = resolveStorageAbsolutePath(attachmentPath);

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return { error: 'File not found' };
    }

    if (forceDownloadFlag) {
      return {
        absolutePath,
        filename: path.basename(normalizedPath || attachmentPath),
        error: null,
      };
    }

    return {
      viewPath: normalizedPath,
      error: null,
    };
  } catch (error) {
    return { error: error.message };
  }
}