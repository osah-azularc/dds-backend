import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module BulkInvoiceSummary
 * @description One row per bulk invoice group's saved Summary-screen state (legacy
 * `bulk_invoice_summary` table, osah.repos/module/Osahform -
 * BulkinvoicesController::saveBulkInvoiceSummaryDraftAction/viewSummaryAction).
 * `bulkInvGrp` references BulkInvoice.bulkInvoiceId (not BulkInvoice's own `id`) - same
 * business-key relationship Invoice.bulkInvGrp uses, see BulkInvoice.js's own field comment.
 *
 * `invSummaryData` is the entire Create-form-derived preview payload, stored as opaque JSON
 * (mediumtext, not a JSON column) - legacy re-reads it as-is on Save Draft's "already exists,
 * update" branch rather than recomputing the preview from scratch. `billableItemsData` exists
 * on the live table but has no reader/writer anywhere in BulkinvoicesController.php (grepped) -
 * left unmapped here rather than modeled speculatively.
 *
 * Column definitions confirmed via a live `DESCRIBE bulk_invoice_summary` (2026-08-24).
 */
const BulkInvoiceSummary = mysqlSequelize.define(
  "BulkInvoiceSummary",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    bulkInvGrp: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "bulk_inv_grp",
    },
    grpNo: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "grp_no",
    },
    invSummaryData: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
      comment: "Opaque JSON string - the full Create-form preview payload, stored as-sent.",
      field: "inv_summary_data",
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: true,
      comment: "0 summary saved, no invoices created yet. 1 summary saved + invoices created. 2 summary/invoices deleted.",
      field: "status",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
  },
  {
    tableName: "bulk_invoice_summary",
    timestamps: false,
    freezeTableName: true,
  },
);

export default BulkInvoiceSummary;
