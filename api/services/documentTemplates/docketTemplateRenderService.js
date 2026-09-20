/**
 * docketTemplateRenderService.js
 *
 * Shared render pipeline for docket-level Document Templates.
 * Loads a template from EFS and applies merge fields via the proven
 * resolver flow (buildCaseContext → resolveFields → applyMergeFields).
 *
 * Used by:
 * - convertTemplate (Preview → PDF)
 * - downloadTemplate (Download & Edit → DOCX)
 */

import fs from 'fs';
import path from 'path';
import DocumentTemplates from '../../models/admin/documentTemplatesModel.js';
import { buildTemplateEfsPath } from './storage/efsTemplateStorageService.js';
import { applyMergeFields } from './mergeService.js';

const renderError = (message, code) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

/**
 * Loads the active template DOCX for templateId, applies merge fields for caseId,
 * and returns the rendered buffer plus a safe .docx filename.
 *
 * @param {number} templateId
 * @param {number|string} caseId
 * @param {Array<{source: string, id: string|number}>} [selectedMailerParties] - Docket Mailer List selection; when supplied, ${Address1}-${Address6} reflect exactly these parties
 * @returns {Promise<{ renderedBuffer: Buffer, safeName: string }>}
 */
export async function renderTemplateForCase(templateId, caseId, selectedMailerParties) {
  const template = await DocumentTemplates.findOne({
    attributes: ['id', 'documentname'],
    where: { id: templateId, active: '1' },
    raw: true,
  });
  if (!template) throw renderError('Template not found.', 'TEMPLATE_NOT_FOUND');

  const safeName = path.basename(template.documentname || '');
  if (!safeName || !safeName.toLowerCase().endsWith('.docx')) {
    throw renderError('Template has invalid file name.', 'CONVERSION_FAILED');
  }

  let filePath;
  try {
    filePath = buildTemplateEfsPath(safeName);
  } catch {
    throw renderError('EFS storage is not configured.', 'CONVERSION_FAILED');
  }

  let docxBuffer;
  try {
    docxBuffer = fs.readFileSync(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') throw renderError('File not found on EFS.', 'FILE_NOT_FOUND');
    if (e.code === 'EACCES') throw renderError('Permission denied reading EFS.', 'CONVERSION_FAILED');
    throw renderError('Error reading template file.', 'CONVERSION_FAILED');
  }

  const renderedBuffer = await applyMergeFields(docxBuffer, caseId, {}, { selectedMailerParties });
  return { renderedBuffer, safeName };
}

/** Maps a renderTemplateForCase error code to an HTTP status. */
export const renderErrorStatus = (code) =>
  code === 'TEMPLATE_NOT_FOUND' || code === 'FILE_NOT_FOUND' ? 404 : 500;
