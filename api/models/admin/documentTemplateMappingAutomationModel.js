import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentTemplateMappingAutomation = mysqlSequelize.define(
  'DocumentTemplateMappingAutomation',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    templateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'template_id' },
    mappingId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'mapping_id' },
    automationType: { type: DataTypes.STRING, allowNull: true, field: 'automation_type' },
    automationSubType: { type: DataTypes.STRING, allowNull: true, field: 'automation_sub_type' },
    displayName: { type: DataTypes.STRING, allowNull: true, field: 'display_name' },
    active: { type: DataTypes.STRING(1), allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    modifiedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'modified_by' },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    modifiedDate: { type: DataTypes.DATE, allowNull: true, field: 'modified_date' },
  },
  {
    tableName: 'document_template_mapping_automation',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocumentTemplateMappingAutomation;
