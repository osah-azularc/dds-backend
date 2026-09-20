import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../../utilities/htmlEscape.js';

/**
 * Shared formatting/path helpers for the Form 1 (DDS Form) print pipeline.
 * Legacy: OsahformController::printosahformAction() inline formatting logic.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATE_PATH = path.join(__dirname, '../../views/forms/printForm1Template.html');

export const getStorageRoot = () => {
  const env = process.env.NODE_ENV || 'local';
  return ['dev', 'stag', 'uat', 'prod'].includes(env)
    ? process.env.EFS_BASE_PATH
    : path.join(process.cwd(), 'public');
};

export const to12Hour = (h) => h % 12 || 12;

export const formatDate = (raw) => {
  if (!raw || raw === '0000-00-00' || raw === 'undefined') return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (!match) return '-';
  const [, yyyy, mm, dd] = match;
  return `${mm}-${dd}-${yyyy}`;
};

export const formatTime = (raw) => {
  if (!raw) return '-';
  const match = /^(\d{2}):(\d{2})/.exec(String(raw));
  if (!match) return '-';
  const hh = Number.parseInt(match[1], 10);
  const mm = match[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${String(to12Hour(hh)).padStart(2, '0')}:${mm}${ampm}`;
};

export const safeVal = (v, fallback = '-') =>
  escapeHtml(v !== null && v !== undefined && v !== '' ? String(v) : fallback);

export const reformatDocketNumber = (docketnumber) => {
  if (!docketnumber) return '';
  const parts = String(docketnumber).split('-');
  if (parts.length < 5) return docketnumber;
  return `${parts[2]}-${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
};

/**
 * Read the HTML template and substitute all {{TOKEN}} placeholders.
 * @param {string} template  Raw HTML string read from printForm1Template.html
 * @param {Object} tokens    Key → already-escaped value map
 * @returns {string}
 */
export const renderTemplate = (template, tokens) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? '');
