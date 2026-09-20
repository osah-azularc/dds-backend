import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentTemplates = mysqlSequelize.define(
  'DocumentTemplates',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    displayname: { type: DataTypes.STRING, allowNull: true },
    documentname: { type: DataTypes.STRING, allowNull: true },
    documenttype: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.STRING(1), allowNull: true },
    scopeType: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_type' },
    isSpanishdoc: { type: DataTypes.STRING(1), allowNull: true, field: 'is_spanishdoc' },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    modifiedDate: { type: DataTypes.DATE, allowNull: true, field: 'modified_date' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    modifiedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'modified_by' },
  },
  {
    tableName: 'document_templates',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocumentTemplates;
