/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Sequelize model for time_entry_activity_log — the audit trail written on
                Edit/Submit/Approve/Reject (never on plain Create, matching legacy, where
                addTimeEntryAction's log call is commented out). `modifiedContent` stores a
                JSON-encoded, allow-listed diff of what changed (see activityLogService.js);
                `description` stores the rendered "Time Entry {action} by {name} ..." sentence.
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const TimeEntryActivityLog = mysqlSequelize.define(
  'TimeEntryActivityLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    // DB column is a plain varchar(50), not a real MySQL ENUM -- kept as STRING so Sequelize's
    // type matches the live column; the 4 legal values are enforced at the service layer
    // (writeActivityLog's only caller-supplied `action` values).
    action: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'action',
    },
    timeEntryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'time_entry_id',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at',
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
    modifiedContent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'modified_content',
    },
  },
  {
    tableName: 'time_entry_activity_log',
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntryActivityLog;
