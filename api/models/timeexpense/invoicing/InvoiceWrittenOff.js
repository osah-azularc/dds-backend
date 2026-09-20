import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvoiceWrittenOff
 * @description One row per write-off applied to an invoice (legacy `invoice_written_off`
 * table, osah.repos/module/Osahform - InvoicesController::saveWriteOffAction). Read-only use
 * so far (View Invoice's activity log join, which surfaces the write-off `reason`) - writing
 * off an invoice is a later phase.
 *
 * Column definitions confirmed against the live `invoice_written_off` CREATE TABLE
 * (2026-08-12 export).
 */
const InvoiceWrittenOff = mysqlSequelize.define(
  "InvoiceWrittenOff",
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
    invStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "inv_status",
    },
    invAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "inv_amount",
    },
    invBalance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "inv_balance",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "reason",
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
    tableName: "invoice_written_off",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoiceWrittenOff;
