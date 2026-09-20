/**
 * Shared lookups against the new Admin-managed document template mapping tables
 * (document_template_casetype_mapping / document_template_mapping_automation /
 * document_templates). Replaces the legacy casetypedocuments/documents_automation
 * lookups used by Quick Actions (NOH, Continuance, Disposition — single + bulk).
 *
 * No legacy fallback: agency+casetype combos not yet configured in the new Admin
 * screen return no templates/mappings here, by design (legacy data is migrated
 * separately, not read from at request time).
 */
import { Op } from 'sequelize';
import DocumentTemplateCasetypeMapping from '../models/admin/documentTemplateCasetypeMappingModel.js';
import DocumentTemplateMappingAutomation from '../models/admin/documentTemplateMappingAutomationModel.js';
import DocumentTemplates from '../models/admin/documentTemplatesModel.js';

/**
 * Fetch active casetype mapping rows for a batch of agency+casetype pairs, matching either
 * an exact agency+casetype row or that agency's wildcard row (casetype === 'all' OR
 * isAllCasetypes === 1 — checked both ways since the two can drift; confirmed on a live
 * DDS row). Callers join automation rows via mapping.id (see getMappingAutomations).
 */
export const getMatchedCasetypeMappings = async (agencies, casetypes) => {
  if (!agencies?.length) return [];
  return DocumentTemplateCasetypeMapping.findAll({
    attributes: ['id', 'templateId', 'agency', ['casetype', 'caseType'], 'isAllCasetypes'],
    where: {
      agency: { [Op.in]: agencies },
      [Op.or]: [
        { casetype: { [Op.in]: [...casetypes, 'all'] } },
        { isAllCasetypes: 1 },
      ],
    },
    raw: true,
  });
};

/**
 * Fetch active automation rows for a batch of mapping IDs, optionally filtered to one
 * automationType ('noh' | 'continuance' | 'decision'). Omit automationType to fetch all three.
 *
 * Also excludes rows whose underlying template has been deactivated in Admin Documents:
 * Admin's enable/disable toggle only updates document_templates.active, never this
 * automation row's own active flag, so the two can disagree. Matches PHP's
 * displayQuickActionsAction, which filters the same query on casetypedocuments.active='1'.
 */
export const getMappingAutomations = async (mappingIds, automationType = null) => {
  if (!mappingIds?.length) return [];
  const automations = await DocumentTemplateMappingAutomation.findAll({
    attributes: ['mappingId', 'templateId', 'automationType', 'automationSubType'],
    where: {
      mappingId: { [Op.in]: mappingIds },
      active: 1,
      automationType: automationType || ['noh', 'continuance', 'decision'],
    },
    raw: true,
  });
  if (!automations.length) return [];

  const templateIds = [...new Set(automations.map((a) => a.templateId))];
  const activeTemplates = await DocumentTemplates.findAll({
    attributes: ['id'],
    where: { id: { [Op.in]: templateIds }, active: '1' },
    raw: true,
  });
  const activeTemplateIds = new Set(activeTemplates.map((t) => t.id));

  return automations.filter((a) => activeTemplateIds.has(a.templateId));
};

/**
 * Fetch the active template for agency+casetype+automationType+documentId (templateId).
 * Used by bulk NOH/Continuance/Disposition, where the dropdown option the cma picked
 * already identifies a specific template — resolving by automationSubType text alone is
 * ambiguous when two active templates share the same subtype label (see getMappedTemplateDoc).
 * Still validates the template is actively mapped for this agency+casetype+automationType,
 * not just that the id exists, so a stale/unrelated id can't be substituted.
 */
export const getMappedTemplateById = async (automationType, agency, casetype, documentId) => {
  if (!documentId) return null;
  const mappings = await getMatchedCasetypeMappings([agency], [casetype]);
  if (!mappings.length) return null;

  const mappingIds = mappings.map((m) => m.id);
  const automation = await DocumentTemplateMappingAutomation.findOne({
    attributes: ['templateId'],
    where: { mappingId: { [Op.in]: mappingIds }, automationType, templateId: documentId, active: 1 },
    raw: true,
  });
  if (!automation) return null;

  const doc = await DocumentTemplates.findOne({
    attributes: ['id', 'documentname', 'documenttype'],
    where: { id: documentId, active: '1' },
    raw: true,
  });
  if (!doc) return null;

  return { documentId: doc.id, documentname: doc.documentname, documenttype: doc.documenttype };
};

/**
 * Fetch the single active template for agency+casetype+automationType+automationSubType.
 * Replaces the legacy getTemplateDoc(automationType, agencyCode, casetype, automationSubType)
 * lookup used by NOH/Continuance/Disposition generation (single + bulk).
 */
export const getMappedTemplateDoc = async (automationType, agency, casetype, automationSubType) => {
  const mappings = await getMatchedCasetypeMappings([agency], [casetype]);
  if (!mappings.length) return null;

  const mappingIds = mappings.map((m) => m.id);
  // Two templates can share a mapping (old inactive one kept alongside its active replacement)
  // — fetch all matches and pick the active template, same as getMappingAutomations above.
  const automations = await DocumentTemplateMappingAutomation.findAll({
    attributes: ['templateId'],
    where: { mappingId: { [Op.in]: mappingIds }, automationType, automationSubType, active: 1 },
    raw: true,
  });
  if (!automations.length) return null;

  const templateIds = [...new Set(automations.map((a) => a.templateId))];
  const doc = await DocumentTemplates.findOne({
    attributes: ['id', 'documentname', 'documenttype'],
    where: { id: { [Op.in]: templateIds }, active: '1' },
    raw: true,
  });
  if (!doc) return null;

  return { documentId: doc.id, documentname: doc.documentname, documenttype: doc.documenttype };
};
