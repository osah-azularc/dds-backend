import DocumentTemplateCasetypeMapping from '../../../models/admin/documentTemplateCasetypeMappingModel.js';
import DocumentTemplateMappingAutomation from '../../../models/admin/documentTemplateMappingAutomationModel.js';

export const SCOPE_TYPE_DECISION = 0;
export const SCOPE_TYPE_GENERAL = 2;
export const SCOPE_TYPE_BOTH = 3;

/**
 * Inserts casetype mapping rows and optional automation rows for a template.
 * Shared by saveDocumentTemplateV2 and updateDocumentTemplateV2.
 * Throws on DB failure — callers must wrap in try/catch with transaction.rollback().
 *
 * @param {object} params
 * @param {number} params.templateId
 * @param {Array}  params.normalizedMappings
 * @param {number} params.scopeTypeValue
 * @param {string} params.normalizedTemplateName
 * @param {number} params.user_id
 * @param {object} params.transaction  - Sequelize transaction
 * @param {Date}   params.now
 */
export async function insertTemplateMappingRows({
  templateId,
  normalizedMappings,
  scopeTypeValue,
  normalizedTemplateName,
  user_id,
  transaction,
  now,
}) {
  const allowsAutomation = scopeTypeValue !== SCOPE_TYPE_GENERAL;

  for (const row of normalizedMappings) {
    const mappingInstance = await DocumentTemplateCasetypeMapping.create(
      {
        templateId,
        agency: row.agency,
        casetype: row.casetype,
        documentOrder: 0,
        docOrderDecNondec: 0,
        scopePart: scopeTypeValue,
        isAllCasetypes: row.casetype === 'all' ? 1 : 0,
        createdDate: now,
        modifiedDate: now,
      },
      { transaction }
    );

    if (row.automation_type && allowsAutomation) {
      await DocumentTemplateMappingAutomation.create(
        {
          templateId,
          mappingId: mappingInstance.id,
          automationType: row.automation_type,
          automationSubType: row.automation_sub_type || null,
          displayName: normalizedTemplateName,
          active: '1',
          createdBy: user_id,
          modifiedBy: user_id,
          createdDate: now,
          modifiedDate: now,
        },
        { transaction }
      );
    }
  }
}
