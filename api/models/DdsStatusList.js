import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DdsStatusList = mysqlSequelize.define(
  'DdsStatusList',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'display_name',
    },
    status: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'status',
    },
  },
  {
    tableName: 'ddsstatuslist',
    timestamps: false,
  }
);

export default DdsStatusList;
