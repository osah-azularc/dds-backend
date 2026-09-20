import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const History = mysqlSequelize.define(
  'History',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,           // DB: caseid DEFAULT NULL
      field: 'caseid',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,          // DB: Docket_caseid NOT NULL
      field: 'Docket_caseid',
    },
    description: {
      type: DataTypes.STRING(10000), // DB: varchar(10000)
      allowNull: true,
      field: 'Description',
    },
    modifiedBy: {
      type: DataTypes.STRING(45),    // DB: varchar(45)
      allowNull: true,
      field: 'Modifiedby',
    },
    date: {
      type: DataTypes.DATEONLY,      // DB: date
      allowNull: true,
      field: 'date',
    },
    createdTime: {
      type: DataTypes.TIME,          // DB: time
      allowNull: true,
      field: 'created_time',
    },
  },
  {
    tableName: 'history',
    timestamps: false,
    freezeTableName: true,
  }
);

export default History;

