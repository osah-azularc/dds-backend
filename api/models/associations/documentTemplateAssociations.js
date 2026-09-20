import DocumentTemplates from '../admin/documentTemplatesModel.js';
import DocumentTemplateCasetypeMapping from '../admin/documentTemplateCasetypeMappingModel.js';
import DocumentTemplateMappingAutomation from '../admin/documentTemplateMappingAutomationModel.js';

// DocumentTemplates → DocumentTemplateCasetypeMapping (one-to-many via template_id)
DocumentTemplates.hasMany(DocumentTemplateCasetypeMapping, {
  foreignKey: 'templateId',
  as: 'mappings',
});
DocumentTemplateCasetypeMapping.belongsTo(DocumentTemplates, {
  foreignKey: 'templateId',
  as: 'template',
});

// DocumentTemplateCasetypeMapping → DocumentTemplateMappingAutomation (one-to-one via mapping_id)
DocumentTemplateCasetypeMapping.hasOne(DocumentTemplateMappingAutomation, {
  foreignKey: 'mappingId',
  as: 'automation',
});
DocumentTemplateMappingAutomation.belongsTo(DocumentTemplateCasetypeMapping, {
  foreignKey: 'mappingId',
  as: 'mapping',
});
