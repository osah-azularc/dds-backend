import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module Invoice
 * @description One row per agency invoice (legacy `invoices` table, osah.repos/module/Osahform
 * - InvoicesController.php / BulkinvoicesController.php), whether created manually or as part
 * of a bulk invoice group (bulkInvGrp).
 *
 * Status codes (legacy inv_logs.action reuses the same set):
 *   2 Draft, 3 Paid, 4 Overdue, 5 Unpaid, 6 Partial, 7 Written off.
 *
 * Column definitions confirmed against the live `invoices` CREATE TABLE (2026-08-12 export).
 *
 * RESOLVED (was "KNOWN GAP"): BulkinvoicesController::saveInvoiceItems writes an `aaa_total`
 * column (`UPDATE invoices SET aaa_total = ...`) not present in the schema export this model was
 * built from. Confirmed directly against the live, shared `invoices` table (2026-08-27, `SHOW
 * COLUMNS ... LIKE 'aaa_total'` - zero rows): the column genuinely does not exist. Since legacy's
 * own `saveInvoiceItems` runs against this exact same shared database, that UPDATE can't actually
 * be succeeding there either - a dead/broken legacy write, not a business requirement this
 * module needs to reproduce. bulkInvoiceGenerateHelpers.js's buildAaaInvoiceItemRows already
 * computes the equivalent perInvoiceAaaAmount in memory and correctly does not attempt to
 * persist it here.
 */
const Invoice = mysqlSequelize.define(
  "Invoice",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    invNo: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "inv_no",
    },
    invDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "inv_date",
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
    agency: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "time_entry_billable_agency.id - not modeled/associated yet (Phase 1 is read-only list)",
      field: "agency",
    },
    agencyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "agency_name",
    },
    agencyEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "agency_email",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
    },
    bulkInvGrp: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "'-' for a manual invoice, otherwise the numeric bulk_invoices.bulkInvoiceId",
      field: "bulk_inv_grp",
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "discount",
    },
    discountDesc: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "discount_desc",
    },
    memo: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "memo",
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "subtotal",
    },
    invAmt: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "inv_amt",
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "balance",
    },
    correction: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: "correction",
    },
    correctionType: {
      type: DataTypes.ENUM("0", "1", "2", "3", "4"),
      allowNull: true,
      defaultValue: "0",
      comment:
        "0 none, 1 db amount was less than actual (increased), 2 db amount was more than actual " +
        "(decreased) - see BulkinvoicesController::getBulkInvoiceDetailsAction. 3/4 are reserved " +
        "in the schema but unused by any legacy code path found so far.",
      field: "correction_type",
    },
    dueDate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of days from invDate until payment is due (e.g. 30) - NOT a date.",
      field: "due_date",
    },
    remitInformation: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "remit_information",
    },
    // Saved-invoice counterpart of InvoiceTemplate's "tanInformation" (invoice_template_manager.
    // tan_information) - a genuinely different column name on that table, not a typo here or
    // there. See InvoiceTemplate.js for the full note.
    taxInformation: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "tax_information",
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "address",
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: true,
      field: "status",
    },
    isDeleted: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
      field: "is_deleted",
    },
    actions: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment:
        "Despite legacy usage looking numeric (status codes), this is a varchar(255) column - stored as a string.",
      field: "actions",
    },
    invDueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "inv_due_date",
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
    tableName: "invoices",
    timestamps: false, // legacy manages created_date/modified_date itself
    freezeTableName: true,
  },
);

export default Invoice;
