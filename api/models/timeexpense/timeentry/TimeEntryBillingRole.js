import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const TimeEntryBillingRole = mysqlSequelize.define(
  'TimeEntryBillingRole',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role: { type: DataTypes.ENUM('judge', 'sa'), allowNull: true },
    subTypeRole: {
      type: DataTypes.ENUM('judge', 'sa', 'saalj', 'law_clerk'),
      allowNull: true,
      field: 'sub_type_role',
    },
    ratePerHour: { type: DataTypes.STRING(10), allowNull: true, field: 'rate_per_hour' },
    billableAccess: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '1',
      field: 'billable_access',
    },
    expenseEntryAccess: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'expense_entry_access',
    },
    invoicingAccess: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'invoicing_access',
    },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    updatedDate: { type: DataTypes.DATE, allowNull: true, field: 'updated_date' },
  },
  {
    tableName: 'time_entry_billing_roles',
    timestamps: false,
    freezeTableName: true,
  }
);

export default TimeEntryBillingRole;
