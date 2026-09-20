import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DispositionType = mysqlSequelize.define(
  'DispositionType',
  {
    idDisposition: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
      field: 'idDisposition',
    },
    dispositionCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'dispositioncode',
    },
  },
  {
    tableName: 'disposition',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DispositionType;