/**
 * EFS Template Storage Service
 *
 * Purpose:
 * Persist final DOCX templates to EFS only (no preview, no PDF conversion).
 *
 * Notes:
 * - Uses EFS_BASE_PATH.
 * - Throws if EFS_BASE_PATH is missing.
 * - Every environment stores templates under the same production-style layout
 *   (no per-environment folder).
 */

import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { getEfsBasePath } from '../../../utilities/efsPath.js';

const DOCX_EXTENSION = '.docx';

const getTemplateRootDir = () => path.join(getEfsBasePath(), 'data', 'templates');

const assertDocxName = (documentName) => {
  if (!documentName || typeof documentName !== 'string') {
    throw new Error('Document name is required for template storage');
  }
  const trimmed = documentName.trim();
  if (!trimmed.toLowerCase().endsWith(DOCX_EXTENSION)) {
    throw new Error('Document name must end with .docx');
  }
  return trimmed;
};

export const buildTemplateEfsPath = (documentName) => {
  const safeName = assertDocxName(documentName);
  return path.join(getTemplateRootDir(), safeName);
};

export const ensureTemplateDirectoryExists = async () => {
  const dirPath = getTemplateRootDir();
  await fsp.mkdir(dirPath, { recursive: true });
  return dirPath;
};

export const saveTemplateBufferToEfs = async (fileBuffer, documentName) => {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error('fileBuffer must be a Buffer');
  }
  await ensureTemplateDirectoryExists();
  const targetPath = buildTemplateEfsPath(documentName);
  await fsp.writeFile(targetPath, fileBuffer);
  return { filePath: targetPath };
};

export const copyTempTemplateToEfs = async (tempFilePath, documentName) => {
  if (!tempFilePath || typeof tempFilePath !== 'string') {
    throw new Error('tempFilePath is required');
  }
  const sourcePath = tempFilePath.trim();
  const fileName = documentName ? assertDocxName(documentName) : assertDocxName(path.basename(sourcePath));
  await ensureTemplateDirectoryExists();
  const targetPath = buildTemplateEfsPath(fileName);
  await fsp.copyFile(sourcePath, targetPath);
  return { filePath: targetPath };
};

export const getTemplateStreamFromEfs = (documentName) => {
  const targetPath = buildTemplateEfsPath(documentName);
  return fs.createReadStream(targetPath);
};

export const templateExistsOnEfs = async (documentName) => {
  const targetPath = buildTemplateEfsPath(documentName);
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};

// Integration note:
// After metadata validation succeeds in saveDocumentTemplateV2,
// call copyTempTemplateToEfs(tempFilePath, tempFileName) to persist the DOCX.

export default {
  buildTemplateEfsPath,
  ensureTemplateDirectoryExists,
  saveTemplateBufferToEfs,
  copyTempTemplateToEfs,
  getTemplateStreamFromEfs,
  templateExistsOnEfs,
};
