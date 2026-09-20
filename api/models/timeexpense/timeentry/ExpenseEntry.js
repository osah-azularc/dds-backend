import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module ExpenseEntry
 * @description Maps the legacy `expense_entry` table - one row per billable (or
 * non-billable) expense, possibly split across multiple agencies. Referenced throughout
 * InvoicesController.php (getExpenseEntries, getBillableFilterListAction,
 * getDateWiseBillableItemsAction) and the not-yet-wired legacy Expense Entry screens.
 *
 * Same CSV-encoded multi-value column pattern as TimeEntry (addedForAgencies / invoiceId /
 * invoiceNo) - not modeled as separate join tables here, still read/written as raw CSV
 * strings, matching legacy.
 *
 * Column definitions confirmed against the live `expense_entry` CREATE TABLE
 * (2026-08-12 export).
 */
const ExpenseEntry = mysqlSequelize.define(
  "ExpenseEntry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },
    expenseId: {
      // Separate from `id` - legacy's "EX" activity links use this, not the PK.
      type: DataTypes.DECIMAL(10, 0),
      allowNull: false,
      field: "expense_id",
    },
    agencies: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agencies",
    },
    agencyWorkType: {
      // Bracketed, quoted list of agency_description strings - legacy filters on this
      // (FIND_IN_SET against a chosen agency's description).
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agency_work_type",
    },
    transactionAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: "transaction_amount",
    },
    differenceAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: "difference_amount",
    },
    roundedAmount: {
      // What legacy's getExpenseEntries aliases as `total_amount` - the figure actually
      // displayed/billed.
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: "rounded_amount",
    },
    location: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "location",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    isDeleted: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_deleted",
    },
    isPosted: {
      // 1 available/unbilled, 2 fully invoiced (all agencies it's split to have billed it),
      // 3 partially invoiced. Billable-activity browsing includes 1/2/3; the separate
      // bulk-invoice item picker (BulkinvoicesController::getAgencyExpenseEntries) excludes 2.
      type: DataTypes.ENUM("0", "1", "2", "3"),
      allowNull: false,
      defaultValue: "1",
      field: "is_posted",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_date",
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updated_date",
    },
    dateIncurred: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "date_incurred",
    },
    expenseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "expense_type_id",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "created_by",
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "updated_by",
    },
    addedForAgencies: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "added_for_agencies",
    },
    addedToInvoice: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "added_to_invoice",
    },
    invoiceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "invoice_id",
    },
    invoiceNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "invoice_no",
    },
    agencyWorkTypeCode: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agency_work_type_code",
    },
    totalRoundedAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: "total_rounded_amount",
    },
  },
  {
    tableName: "expense_entry",
    timestamps: false,
    freezeTableName: true,
  },
);

export default ExpenseEntry;
