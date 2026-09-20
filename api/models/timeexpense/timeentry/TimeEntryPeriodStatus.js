/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Sequelize model for time_entry_period_status — 3 fixed lookup rows
                (1=Open, 2=In Review, 3=Closed). Confirmed live in the legacy DB (id
                convention matches every PHP action's hardcoded status-id filters).
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const TimeEntryPeriodStatus = mysqlSequelize.define(
  'TimeEntryPeriodStatus',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    periodStatus: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'period_status',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_date',
    },
  },
  {
    tableName: 'time_entry_period_status',
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntryPeriodStatus;
