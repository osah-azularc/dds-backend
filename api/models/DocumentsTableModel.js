import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const DocumentsTableModel = mysqlSequelize.define(
  "Document",
  {
    documentid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Caseid: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DocumentType: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    Granted: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    DateRequested: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    Description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    Attachmentfilepaths: {
      type: DataTypes.STRING(2000),
      allowNull: true,
    },
    DocumentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    noofattachments: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    Docket_caseid: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    doc_file_flage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    roc_flag: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    casetype_doc_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_scanned: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "1",
      comment: "1=> File scanned, 0=> File not scanned",
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    modified_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    modified_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_sealed: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
    },
    document_name_in_aws_bucket: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: "NULL",
    },
  },
  {
    tableName: "documentstable", // Specify the table name
    timestamps: false, // Disable automatic `createdAt` and `updatedAt` fields
    freezeTableName: true, // Prevent Sequelize from pluralizing the table name
  },
);

export default DocumentsTableModel;
