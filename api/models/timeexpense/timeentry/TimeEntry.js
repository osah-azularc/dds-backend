import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module TimeEntry
 * @description Maps the legacy `time_entry` table - one row per billable (or non-billable)
 * time entry logged against a task, possibly split across multiple agencies. Referenced
 * throughout InvoicesController.php (getTimeEntries, getBillableFilterListAction,
 * getDateWiseBillableItemsAction) and the not-yet-wired legacy Time Entry screens.
 *
 * `task` is a text column joined against time_entry_tasks.id via implicit type coercion in
 * legacy's raw SQL (`tet.id = t.task`) - it is NOT an integer FK at the DB level, despite
 * looking like one everywhere it's used.
 *
 * `addedForAgencies` / `invoiceId` / `invoiceNo` are CSV-encoded multi-value columns (one
 * entry can be split across several agencies' invoices) - see the porting plan's note on this
 * pattern. Not modeled as separate join tables here; still read/written as raw CSV strings,
 * matching legacy.
 *
 * Column definitions confirmed against the live `time_entry` CREATE TABLE (2026-08-12 export).
 */
const TimeEntry = mysqlSequelize.define(
  "TimeEntry",
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
      allowNull: true,
      field: "user_id",
    },
    task: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "References time_entry_tasks.id, but is a text column, not an integer FK.",
      field: "task",
    },
    agencies: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agencies",
    },
    agencyWorkType: {
      // Bracketed, quoted list of agency_description strings, e.g. ["BNR - Air Quality"].
      // Legacy filters on this (FIND_IN_SET against a chosen agency's description).
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agency_work_type",
    },
    agencyWorkTypeCode: {
      // Same shape as agencyWorkType, but agency codes instead of descriptions - what's
      // actually displayed in the UI.
      type: DataTypes.TEXT,
      allowNull: true,
      field: "agency_work_type_code",
    },
    addedForAgencies: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "added_for_agencies",
    },
    timeTrackingDateEntry: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "time_tracking_date_entry",
    },
    originalWorkingTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: "original_working_time",
    },
    roundedUpTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: "rounded_up_time",
    },
    splitTimeBtwnAgency: {
      // Hours billed to this particular agency for this entry - HH:MM:SS. Legacy computes
      // `quantity = ROUND(TIME_TO_SEC(split_time_btwn_agency)/3600, 2)` from this.
      type: DataTypes.TIME,
      allowNull: true,
      field: "split_time_btwn_agency",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    isDeleted: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "is_deleted",
    },
    isSubmitted: {
      // 0 draft, 2 submitted/approved (the only value legacy's billable-activity queries
      // accept - `is_submitted = '2'`). 1/3 meanings not confirmed by any code path read so far.
      type: DataTypes.ENUM("0", "1", "2", "3"),
      allowNull: false,
      defaultValue: "0",
      field: "is_submitted",
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
    rejectionComments: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "rejection_comments",
    },
    addedToInvoice: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "added_to_invoice",
    },
    invoiceId: {
      // CSV of "agencyId-invoiceId" pairs.
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "invoice_id",
    },
    invoiceNo: {
      // CSV of "agencyId#invoiceNo" pairs.
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "invoice_no",
    },
  },
  {
    tableName: "time_entry",
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntry;
