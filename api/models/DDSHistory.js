import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DDSHistory = mysqlSequelize.define(
  'DDSHistory',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'form1_id',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'date',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'Description',
    },
    modifiedBy: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'Modifiedby',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'Docket_caseid',
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'caseid',
    },
    createdTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: 'created_time',
    },
  },
  {
    tableName: 'ddshistory',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DDSHistory;