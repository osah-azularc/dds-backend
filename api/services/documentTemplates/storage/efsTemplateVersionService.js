/**
 * EFS Template Version Storage Service
 *
 * Manages DOCX version snapshots under:
 *   <EFS_BASE_PATH>/data/templates_version/<templateId>/<timestamp>/
 *
 * Rules enforced here:
 * - snapshotTemplateToVersion  reads from /templates,  writes to /templates_version
 * - deleteTemplateFromEfs       only deletes from /templates — never touches /templates_version
 * - cleanupVersionSnapshot      removes an orphaned version directory on rollback (best-effort)
 *
 * buildTemplateEfsPath is imported from the existing active-template service so
 * path logic stays in one place.
 */

import { promises as fsp } from 'fs';
import path from 'path';
import { buildTemplateEfsPath } from './efsTemplateStorageService.js';
import { getEfsBasePath } from '../../../utilities/efsPath.js';

/**
 * Absolute path to the templates_version root for one template.
 *   <EFS_BASE_PATH>/data/templates_version/<templateId>
 * @param {number|string} templateId
 * @returns {string}
 */
const getVersionRootDir = (templateId) =>
  path.join(getEfsBasePath(), 'data', 'templates_version', String(templateId));

/**
 * Copy the current active DOCX to a versioned snapshot directory.
 *
 * Source:  <EFS>/templates/<documentName>
 * Dest:    <EFS>/templates_version/<templateId>/<timestamp>/<documentName>
 *
 * @param {string} documentName  - Active filename (e.g. "my_template.docx")
 * @param {number} templateId    - Template DB id
 * @param {string} [nodeEnv]
 * @returns {Promise<{ documentPath: string, timestamp: number, versionDir: string }>}
 *   documentPath — relative path stored in DB (env-independent)
 *   timestamp    — used for cleanup reference
 *   versionDir   — absolute path for best-effort cleanup on rollback
 */
export const snapshotTemplateToVersion = async (documentName, templateId) => {
  const sourcePath = buildTemplateEfsPath(documentName);
  const timestamp = Date.now();
  const versionDir = path.join(getVersionRootDir(templateId), String(timestamp));

  await fsp.mkdir(versionDir, { recursive: true });

  const targetPath = path.join(versionDir, documentName);
  await fsp.copyFile(sourcePath, targetPath);

  // Store a relative, env-independent path so it remains valid after env changes
  const documentPath = `data/templates_version/${templateId}/${timestamp}/${documentName}`;

  return { documentPath, timestamp, versionDir };
};

/**
 * Delete the active file from /templates only.
 * Used during a rename edit to remove the old filename after the new one is written.
 *
 * NEVER deletes from /templates_version.
 *
 * @param {string} documentName  - Filename to remove from /templates
 * @returns {Promise<void>}
 */
export const deleteTemplateFromEfs = async (documentName) => {
  const targetPath = buildTemplateEfsPath(documentName);
  await fsp.unlink(targetPath);
};

/**
 * Best-effort removal of an orphaned version snapshot directory.
 * Called in the catch block when the DB transaction rolled back after a snapshot was taken.
 *
 * Errors are intentionally re-thrown so the caller can log them as warnings.
 *
 * @param {string} versionDir  - Absolute path returned by snapshotTemplateToVersion
 * @returns {Promise<void>}
 */
export const cleanupVersionSnapshot = async (versionDir) => {
  await fsp.rm(versionDir, { recursive: true, force: true });
};

/**
 * Restore a snapshot file back to the active /templates directory.
 * Used for same-name rollback when the DB transaction failed after the active
 * file was already overwritten in-place. The snapshot is the only copy of the
 * previous content.
 *
 * Errors are intentionally re-thrown so the caller can decide whether to
 * clean up the snapshot (on success) or preserve it (on failure).
 *
 * @param {string} versionDir   - Absolute path to the version snapshot directory
 * @param {string} documentName - Filename to restore (e.g. "my_template.docx")
 * @returns {Promise<void>}
 */
export const restoreSnapshotToActiveTemplate = async (versionDir, documentName) => {
  const sourcePath = path.join(versionDir, documentName);
  const targetPath = buildTemplateEfsPath(documentName);
  await fsp.copyFile(sourcePath, targetPath);
};

/**
 * Delete all version snapshot files for a template from EFS.
 * Called post-commit during hard delete. Errors should be caught and logged by the caller.
 *
 * @param {number|string} templateId
 * @returns {Promise<void>}
 */
export const deleteTemplateVersionDir = async (templateId) => {
  const dir = getVersionRootDir(templateId);
  await fsp.rm(dir, { recursive: true, force: true });
};
