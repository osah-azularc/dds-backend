/*
  Created by  : Snehal Narkar
  Date        : 2026-08-17
  Description : Sequelize model for time_entry_tasks (Admin Time Entry Tasks).
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const TimeEntryTask = mysqlSequelize.define(
  'TimeEntryTask',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    taskName: { type: DataTypes.TEXT, allowNull: true, field: 'task_name' },
    taskAbbreviation: { type: DataTypes.TEXT, allowNull: true, field: 'task_abbreviation' },
    taskDescription: { type: DataTypes.TEXT, allowNull: true, field: 'task_description' },
    isBillable: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      field: 'task_billable',
    },
    isActive: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '1',
      field: 'task_billable_active',
    },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    updatedDate: { type: DataTypes.DATE, allowNull: true, field: 'updated_date' },
  },
  {
    tableName: 'time_entry_tasks',
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntryTask;
