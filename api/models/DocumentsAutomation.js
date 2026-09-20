import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentsAutomation = mysqlSequelize.define(
  'DocumentsAutomation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    automationType: {
      type: DataTypes.STRING(25),
      allowNull: true,
      field: "automation_type",
      comment: "it will be NOH,Continuance or Decision",
    },
    automationSubType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "automation_sub_type",
    },
    automationFlag: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
      field: "automation_flag",
      comment: "1 = true, 0 = false",
    },
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'document_id',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'modified_by',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_date',
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'modified_date',
    },
    isActive: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '1',
      field: 'is_active',
    },
  },
  {
    tableName: 'documents_automation',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocumentsAutomation;

