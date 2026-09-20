import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const SummaryTable = mysqlSequelize.define(
  'SummaryTable',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'caseid',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'date',
    },
    summaryNotes: {
      type: DataTypes.STRING(10000),
      allowNull: true,
      field: 'summarynotes',
    },
    updatedBy: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'updatedby',
    },
    deleted: {
      type: DataTypes.STRING(3),
      allowNull: true,
      field: 'deleted',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'Docket_caseid',
    },
  },
  {
    tableName: 'summarytable',
    timestamps: false,
    freezeTableName: true,
  },
);

export default SummaryTable;