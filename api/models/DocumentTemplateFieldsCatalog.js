import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentTemplateFieldsCatalog = mysqlSequelize.define(
  'DocumentTemplateFieldsCatalog',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    fieldKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'field_key',
    },
    templateFamily: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'template_family',
    },
    displayName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'description',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'category',
    },
    sampleValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sample_value',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_order',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isRepeatable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_repeatable',
    },
    isSystemManaged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system_managed',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    tableName: 'document_template_fields_catalog',
    timestamps: false,
  }
);

export default DocumentTemplateFieldsCatalog;
