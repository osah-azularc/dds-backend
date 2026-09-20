import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module BulkInvoice
 * @description One row per bulk invoice group (legacy `bulk_invoices` table,
 * osah.repos/module/Osahform - InvoicesController::getBulkInvoiceListAction /
 * BulkinvoicesController.php). Groups multiple per-agency `invoices` rows together -
 * Invoice.bulkInvGrp references this row's bulkInvoiceId, not its own id.
 *
 * Column definitions confirmed against the live `bulk_invoices` CREATE TABLE (2026-08-12 export).
 */
const BulkInvoice = mysqlSequelize.define(
  "BulkInvoice",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    bulkInvoiceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "The id Invoice.bulkInvGrp actually references - not the same as this row's own id.",
      field: "bulk_invoice_id",
    },
    groupId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "group_id",
    },
    billDateFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "bill_date_from",
    },
    billDateTo: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "bill_date_to",
    },
    cases: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "cases",
    },
    caseReferralFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "case_referral_fee",
    },
    totalAmountInvoiced: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "total_amount_invoiced",
    },
    oldTotalAmountInvoiced: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "old_total_amount_invoiced",
    },
    noOfAgencies: {
      type: DataTypes.TINYINT,
      allowNull: true,
      field: "no_of_agencies",
    },
    status: {
      type: DataTypes.ENUM("0", "1", "2", "3"),
      allowNull: true,
      comment:
        "0 deleted, 1 summary created + invoices generated & sent, 2 invoices generated but " +
        "draft (not sent), 3 summary-only draft (no invoices generated yet). List UI shows " +
        "both 2 and 3 as Draft.",
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
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    modifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_at",
    },
    billingPeriodDateFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "billing_period_date_from",
    },
    billingPeriodDateTo: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "billing_period_date_to",
    },
    isCorrected: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "is_corrected",
    },
  },
  {
    tableName: "bulk_invoices",
    timestamps: false,
    freezeTableName: true,
  },
);

export default BulkInvoice;
