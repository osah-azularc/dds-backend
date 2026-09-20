import fs from 'fs';
import path from 'path';
import { Op, fn, col, where } from "sequelize";
import DocumentTemplates from '../models/admin/documentTemplatesModel.js';
import DocumentTemplateCasetypeMapping from '../models/admin/documentTemplateCasetypeMappingModel.js';
import { buildTemplateEfsPath } from '../services/documentTemplates/storage/efsTemplateStorageService.js';
import { convertDocxToPdfWithoutS3 } from '../../helpers/s3.js';
import { resolveFields } from '../services/documentTemplates/resolvers/resolverEngine.js';
import { resolverRegistry } from '../services/documentTemplates/resolvers/fieldResolverRegistry.js';
import { renderTemplateForCase, renderErrorStatus } from '../services/documentTemplates/docketTemplateRenderService.js';

/**
 * GET /docket/templates/mapped?agency=AG&caseType=CPD
 * Returns active Decision/Non-Decision templates mapped to the given agency + case type.
 * Matches either:
 *   - exact agency + casetype row
 *   - agency-level "All" row (is_all_casetypes = 1)
 */
export const getMappedTemplates = async (req, res) => {
  const { agency, caseType, documentTypeFilter } = req.query;

  if (!agency || !caseType) {
    return res.status(400).json({ success: false, message: 'agency and caseType query params are required.' });
  }

  try {
    const mappingRows = await DocumentTemplateCasetypeMapping.findAll({
      attributes: ['templateId'],
      where: {
        [Op.or]: [
          { agency, casetype: caseType },
          { agency, isAllCasetypes: 1 },
        ],
      },
      raw: true,
    });

    if (mappingRows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const templateIds = [...new Set(mappingRows.map((r) => r.templateId))];

    const templateWhere = { id: { [Op.in]: templateIds }, active: '1' };
    if (documentTypeFilter === 'decision') {
      templateWhere[Op.and] = where(fn('LOWER', col('documenttype')), 'decision');
    } else if (documentTypeFilter === 'nonDecision') {
      templateWhere[Op.and] = {
        [Op.or]: [
          { documenttype: null },
          { documenttype: '' },
          where(fn('LOWER', col('documenttype')), { [Op.ne]: 'decision' }),
        ],
      };
    }

    const rows = await DocumentTemplates.findAll({
      attributes: ['id', 'displayname', 'documentname', 'documenttype', 'scopeType'],
      where: templateWhere,
      raw: true,
    });

    const data = rows.map((r) => ({
      templateId: r.id,
      displayName: r.displayname,
      documentName: r.documentname,
      documentType: r.documenttype,
      scopeType: r.scopeType,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch mapped templates.' });
  }
};

/**
 * GET /docket/templates/all-active
 * Returns all active document templates (Phase 1 – All Documents only).
 * No joins. No agency/case-type filtering. No is_alt_storage reference.
 */
export const getAllActiveTemplates = async (_req, res) => {
  try {
    const rows = await DocumentTemplates.findAll({
      attributes: ['id', 'displayname', 'documentname', 'documenttype', 'scopeType'],
      where: { active: '1' },
      raw: true,
    });

    const data = rows.map((r) => ({
      templateId: r.id,
      displayName: r.displayname,
      documentName: r.documentname,
      documentType: r.documenttype,
      scopeType: r.scopeType,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch templates.' });
  }
};

// POST /docket/templates/retrieve — Phase A: verify DOCX exists on EFS.
export const retrieveTemplate = async (req, res) => {
  const { templateId } = req.body;

  if (!templateId) {
    return res.status(400).json({ success: false, error: 'templateId is required.' });
  }

  const parsedId = parseInt(templateId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid templateId.' });
  }

  try {
    const template = await DocumentTemplates.findOne({
      attributes: ['id', 'displayname', 'documentname', 'documenttype', 'scopeType'],
      where: { id: parsedId, active: '1' },
      raw: true,
    });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });

    const safeName = path.basename(template.documentname || '');
    if (!safeName || !safeName.toLowerCase().endsWith('.docx')) {
      return res.status(500).json({ success: false, error: 'Template has invalid file name.' });
    }

    let filePath;
    try {
      filePath = buildTemplateEfsPath(safeName);
    } catch (_buildErr) {
      return res.status(500).json({ success: false, error: 'EFS storage is not configured.' });
    }

    try {
      fs.statSync(filePath);
    } catch (statError) {
      if (statError.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found on EFS.' });
      if (statError.code === 'EACCES') return res.status(500).json({ success: false, error: 'Permission denied reading template file.' });
      return res.status(500).json({ success: false, error: 'Error accessing template file.' });
    }

    return res.status(200).json({
      success: true,
      template: {
        id: template.id,
        templateName: template.displayname,
        documentType: template.documenttype,
        fileExists: true,
        version: 1,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to retrieve template.' });
  }
};

// POST /docket/templates/convert — Phase B: read DOCX from EFS, convert to PDF base64.
export const convertTemplate = async (req, res) => {
  const { templateId, caseId, selectedMailerParties } = req.body;
  if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required.', code: 'INVALID_INPUT' });
  const parsedId = parseInt(templateId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return res.status(400).json({ success: false, error: 'Invalid templateId.', code: 'INVALID_INPUT' });
  try {
    const { renderedBuffer, safeName } = await renderTemplateForCase(parsedId, caseId, selectedMailerParties);
    let result;
    try { result = await convertDocxToPdfWithoutS3({ buffer: renderedBuffer }); } catch { return res.status(500).json({ success: false, error: 'PDF conversion failed.', code: 'CONVERSION_FAILED' }); }
    if (!result?.streamPdf) return res.status(500).json({ success: false, error: 'PDF conversion failed.', code: 'CONVERSION_FAILED' });
    return res.status(200).json({ success: true, pdfBuffer: result.streamPdf.toString('base64'), fileName: safeName.replace(/\.docx$/i, '.pdf'), mimeType: 'application/pdf' });
  } catch (err) {
    return res.status(renderErrorStatus(err.code)).json({ success: false, error: err.message || 'Failed to convert template.', code: err.code || 'CONVERSION_FAILED' });
  }
};

// POST /docket/templates/download — Download & Edit: read DOCX from EFS, apply merge fields, return binary DOCX.
export const downloadTemplate = async (req, res) => {
  const { templateId, caseId, selectedMailerParties } = req.body;
  if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required.', code: 'INVALID_INPUT' });
  const parsedId = parseInt(templateId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return res.status(400).json({ success: false, error: 'Invalid templateId.', code: 'INVALID_INPUT' });
  const parsedCaseId = parseInt(caseId, 10);
  if (!Number.isInteger(parsedCaseId) || parsedCaseId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid caseId is required.', code: 'INVALID_INPUT' });
  }
  if (!Array.isArray(selectedMailerParties) || selectedMailerParties.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one mailer list party must be selected.', code: 'INVALID_INPUT' });
  }
  try {
    const { renderedBuffer, safeName } = await renderTemplateForCase(parsedId, caseId, selectedMailerParties);
    const downloadName = safeName.replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    return res.status(200).send(renderedBuffer);
  } catch (err) {
    return res.status(renderErrorStatus(err.code)).json({ success: false, error: err.message || 'Failed to download template.', code: err.code || 'CONVERSION_FAILED' });
  }
};

/**
 * GET /docket/templates/general
 * Returns active templates with scope_type IN (2, 3) — General Documents.
 * No joins. No agency/case-type filtering. Only queries document_templates.
 */
export const getGeneralDocumentTemplates = async (_req, res) => {
  try {
    const rows = await DocumentTemplates.findAll({
      attributes: ['id', 'displayname', 'documentname', 'documenttype', 'scopeType'],
      where: { active: '1', scopeType: { [Op.in]: [2, 3] } },
      raw: true,
    });

    const data = rows.map((r) => ({
      templateId: r.id,
      displayName: r.displayname,
      documentName: r.documentname,
      documentType: r.documenttype,
      scopeType: r.scopeType,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch general templates.' });
  }
};

/**
 * POST /docket/templates/resolver-test  (dev/debug only — not registered in production)
 * Validates the resolver layer end-to-end against a caller-supplied context object.
 * Body: { fieldKeys: string[], context: object }
 */
export const resolverTest = async (req, res) => {
  const { fieldKeys, context } = req.body ?? {};

  if (!Array.isArray(fieldKeys) || fieldKeys.length === 0 || !fieldKeys.every((k) => typeof k === 'string')) {
    return res.status(400).json({ success: false, error: 'fieldKeys must be a non-empty array of strings.', code: 'INVALID_INPUT' });
  }

  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    return res.status(400).json({ success: false, error: 'context must be a plain object.', code: 'INVALID_INPUT' });
  }

  try {
    const resolved = await resolveFields(fieldKeys, context);
    const unknownKeys = fieldKeys.filter((key) => !(key in resolverRegistry));
    const emptyKeys = Object.entries(resolved).filter(([, v]) => v === '').map(([k]) => k);
    const resolvedCount = Object.values(resolved).filter((v) => v !== '').length;

    return res.status(200).json({
      success: true,
      resolved,
      meta: {
        requestedCount: fieldKeys.length,
        resolvedCount,
        unknownKeys,
        emptyKeys,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Resolver encountered an unexpected error.', code: 'RESOLVER_ERROR' });
  }
};
