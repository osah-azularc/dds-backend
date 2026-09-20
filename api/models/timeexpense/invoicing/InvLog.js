import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvLog
 * @description One row per invoice activity/audit event (legacy `inv_logs` table,
 * osah.repos/module/Osahform - InvoicesController::saveInvoiceAction /
 * getInvoiceActivityLogsAction). `action` reuses the same status codes as invoices.status
 * (2 Draft, 3 Paid, 4 Overdue, 5 Unpaid, 6 Partial, 7 Written off) plus a few action-only
 * codes (e.g. 9 = deleted) that never appear as an actual invoice status.
 *
 * Column definitions confirmed against the live `inv_logs` CREATE TABLE (2026-08-12 export).
 */
const InvLog = mysqlSequelize.define(
  "InvLog",
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
      allowNull: true,
      field: "inv_id",
    },
    invNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "inv_no",
    },
    extId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "invoice_attachments.id / invoice_written_off.id, depending on the log entry - not used for create/save-draft logs.",
      field: "ext_id",
    },
    action: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "action",
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "description",
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
    status: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      field: "status",
    },
  },
  {
    tableName: "inv_logs",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvLog;
