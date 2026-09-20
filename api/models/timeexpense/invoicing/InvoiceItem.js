import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvoiceItem
 * @description One row per line item on an invoice (legacy `invoice_items` table,
 * osah.repos/module/Osahform - InvoicesController::saveInvoiceAction). itemType is 'time',
 * 'expense', or 'other' (manual entries like Case Referral Fee) - for 'time'/'expense' rows,
 * `expense`/`taskId` reference the source time_entry/expense_entry row's id; for 'other' rows
 * they hold the manual entry's own type-code (e.g. 1 for Case Referral Fee).
 *
 * Column definitions confirmed against the live `invoice_items` CREATE TABLE (2026-08-12 export).
 */
const InvoiceItem = mysqlSequelize.define(
  "InvoiceItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    invId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "inv_id",
    },
    invNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "inv_no",
    },
    expense: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "time_entry.id / expense_entry.id for billable items, or a manual type-code (1 = Case Referral Fee) for 'other' items.",
      field: "expense",
    },
    itemType: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "'time' | 'expense' | 'other'",
      field: "item_type",
    },
    itemName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "item_name",
    },
    taskId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "task_id",
    },
    professional: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "judge_assistant_clerk.user_id",
      field: "professional",
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      field: "quantity",
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "rate",
    },
    unit: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "unit",
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "total",
    },
    isDeleted: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
      field: "is_deleted",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_at",
    },
  },
  {
    tableName: "invoice_items",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoiceItem;
