import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/**
 * @module InvoiceAttachment
 * @description Maps the legacy `invoice_attachments` table - extra files staff can attach to
 * an invoice, stapled onto the outgoing email alongside the generated PDF
 * (InvoicesController.php: downloadEachAttachmentAction, addFileAction, getInvoiceAttachmentsAction).
 *
 * Column definitions confirmed against the live `invoice_attachments` CREATE TABLE
 * (2026-08-12 export).
 */
const InvoiceAttachment = mysqlSequelize.define(
  "InvoiceAttachment",
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
    filepath: {
      // S3 key (osah-timekeeping bucket) - what downloadEachAttachmentAction streams back.
      type: DataTypes.STRING(500),
      allowNull: false,
      field: "filepath",
    },
    fileName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "file_name",
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "agency_id",
    },
    status: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      comment: "0=>Not Active, 1=>Active",
      field: "status",
    },
    fileType: {
      type: DataTypes.ENUM("0", "1", "2"),
      allowNull: true,
      comment: "0=>xlsx, 1=>csv, 2=>pdf",
      field: "file_type",
    },
    bulkInvGrpId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "bulk_inv_grp_id",
    },
    uploadedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "UserId of person uploading it",
      field: "uploaded_by",
    },
    uploadedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "uploaded_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "modified_date",
    },
  },
  {
    tableName: "invoice_attachments",
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoiceAttachment;
