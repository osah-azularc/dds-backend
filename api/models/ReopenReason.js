import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const ReopenReason = mysqlSequelize.define(
  'ReopenReason',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    reasons: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'reasons',
    },
  },
  {
    tableName: 'reopen_reason',
    timestamps: false,
    freezeTableName: true,
  }
);

export default ReopenReason;