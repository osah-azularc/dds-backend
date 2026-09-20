import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvoiceTemplate
 * @description Single-row org-wide invoice template settings (legacy `invoice_template_manager`
 * table, osah.repos/module/Osahform - InvoicesController::getRemitDetailsAction). Supplies the
 * default heading/address/remit-to/tax info shown on a new manual invoice, and the default
 * Case Referral Fee rate.
 *
 * Column definitions confirmed against the live `invoice_template_manager` CREATE TABLE
 * (2026-08-12 export).
 */
const InvoiceTemplate = mysqlSequelize.define(
  "InvoiceTemplate",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },
    heading: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "heading",
    },
    image: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "image",
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "address",
    },
    remitInformation: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "remit_information",
    },
    // Genuinely named "tan_information" in this table - not a typo for the Invoice model's
    // "tax_information" column. Two different real legacy columns; the frontend deliberately
    // maps this one into its own "taxInformation" form field on read (see
    // useManualInvoiceForm.js's getRemitDetails handler). Keep both names as-is.
    tanInformation: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "tan_information",
    },
    caseReferralFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "case_referral_fee",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "updated_date",
    },
  },
  {
    tableName: "invoice_template_manager",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoiceTemplate;
