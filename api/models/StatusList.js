import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const StatusList = mysqlSequelize.define(
  'StatusList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    statusList: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'statuslist',
    },
  },
  {
    tableName: 'statuslist',
    timestamps: false,
  }
);

export default StatusList;

