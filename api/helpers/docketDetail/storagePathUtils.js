import fs from 'node:fs';
import path from 'node:path';

const KNOWN_UPLOAD_PREFIX = /^\/upload\//i;
// Legacy per-environment folders (retired) — strip them off old stored paths so they
// resolve to the same, single production-style '/upload/...' path as everything else.
const LEGACY_ENV_UPLOAD_PREFIX = /^\/(DEV-Data|STG-Data|UAT-Data)(?=\/)/i;

const normalizeSlashes = (value) => (`/${String(value || '').replace(/^\/+/, '')}`)
  .replaceAll(/\\+/g, '/')
  .replaceAll(/\/{2,}/g, '/');

const normalizeForComparison = (value) => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export function getUploadRoot() {
  return '/upload';
}

export function getPublicRoot() {
  const candidates = [
    path.join(process.cwd(), 'backend', 'public'),
    path.join(process.cwd(), 'public'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore invalid candidate paths and continue.
    }
  }

  return path.join(process.cwd(), 'public');
}

export function getStorageBaseRoot() {
  const explicit = process.env.EFS_BASE_PATH;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  return getPublicRoot();
}

export function normalizeAttachmentPath(attachmentPath) {
  let normalizedPath = String(attachmentPath || '').trim();
  if (!normalizedPath) {
    return '';
  }

  normalizedPath = normalizeSlashes(normalizedPath);
  normalizedPath = normalizeSlashes(normalizedPath.replace(LEGACY_ENV_UPLOAD_PREFIX, ''));

  if (!KNOWN_UPLOAD_PREFIX.test(normalizedPath)) {
    normalizedPath = normalizeSlashes(`${getUploadRoot()}${normalizedPath}`);
  }

  return normalizedPath;
}

export function resolveStorageAbsolutePath(attachmentPath, baseRoot = getStorageBaseRoot()) {
  const normalizedPath = normalizeAttachmentPath(attachmentPath);
  if (!normalizedPath) {
    return { normalizedPath: '', absolutePath: '' };
  }

  const relativePath = normalizedPath.replace(/^[\\/]+/, '');
  const absolutePath = path.resolve(baseRoot, relativePath);
  const normalizedBaseRoot = normalizeForComparison(baseRoot);
  const normalizedAbsolutePath = normalizeForComparison(absolutePath);
  const safeRootPrefix = normalizedBaseRoot.endsWith(path.sep)
    ? normalizedBaseRoot
    : `${normalizedBaseRoot}${path.sep}`;

  const isWithinBase = normalizedAbsolutePath === normalizedBaseRoot
    || normalizedAbsolutePath.startsWith(safeRootPrefix);

  if (!isWithinBase) {
    throw new Error('Resolved file path is outside the configured storage root');
  }

  return { normalizedPath, absolutePath };
}
