/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Sequelize model for time_entry_periods — one row per calendar month, created
                yearly by timeEntryPeriodCron.js. Mirrors legacy's time_entry_periods table
                (TimeExpenseController.php's getAllOpenPeriodAction / checkInProgress.../
                checkClosed... actions). `time_entry` rows are matched to a period by
                date-range containment (entryStart <= date <= entryEnd) at query time, not a
                stored foreign key — legacy has no such column either, so this is preserved.
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const TimeEntryPeriod = mysqlSequelize.define(
  'TimeEntryPeriod',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    entryPeriod: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entry_period',
    },
    entryStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'entry_start',
    },
    entryEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'entry_end',
    },
    fkPeriodStatusId: {
      // 1 Open, 2 In Review, 3 Closed — see TimeEntryPeriodStatus.js.
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'fk_period_status_id',
    },
    isVisible: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'is_visible',
    },
    isDeleted: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_deleted',
    },
    manualUpdate: {
      // Set when a status change came from an admin action (Review & Post) rather than
      // the monthly visibility cron.
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'manual_update',
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
    tableName: 'time_entry_periods',
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntryPeriod;
