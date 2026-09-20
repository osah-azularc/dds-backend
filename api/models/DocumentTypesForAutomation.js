import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentTypesForAutomation = mysqlSequelize.define(
  'DocumentTypesForAutomation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id",
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "type",
    },
    automationType: {
      type: DataTypes.STRING(25),
      allowNull: true,
      comment: '1=Decision, 2=Continuance, 3=NOH',
      field: "automation_type",
    },
  },
  {
    tableName: "document_types_for_automation",
    timestamps: false,
  }
);


export default DocumentTypesForAutomation;

