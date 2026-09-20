import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvoicePartialPayment
 * @description One row per partial payment applied to an invoice (legacy
 * `invoice_partial_payments` table, osah.repos/module/Osahform -
 * InvoicesController::getInvoicePaymentHistoryAction / updatePartialAmountAction). Read-only
 * use so far (View Invoice's payment history panel) - applying a new payment is a later phase.
 *
 * Column definitions confirmed against the live `invoice_partial_payments` CREATE TABLE
 * (2026-08-12 export).
 */
const InvoicePartialPayment = mysqlSequelize.define(
  "InvoicePartialPayment",
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
    oldInvAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "old_inv_amount",
    },
    partialAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "partial_amount",
    },
    newInvAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "new_inv_amount",
    },
    paymentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "payment_date",
    },
    memo: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "memo",
    },
    status: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      field: "status",
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
    tableName: "invoice_partial_payments",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoicePartialPayment;
