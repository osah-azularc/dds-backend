"use strict";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const ExternalDocuments = mysqlSequelize.define(
  "ExternalDocuments",
  {
    // ✅ Use camelCase attributes with field mapping
    documentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "document_id",
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "caseid",
    },
    documentType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "document_type",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    dateSubmitted: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "date_submitted",
    },
    timeSubmitted: {
      type: DataTypes.TIME,
      allowNull: true,
      defaultValue: "00:00:00",
      field: "time_submitted",
    },
    documentFilePath: {
      type: DataTypes.STRING(250),
      allowNull: true,
      field: "document_file_path",
    },
    formStatusDesc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "form_status_desc",
    },
    rejectedReason: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "rejected_reason",
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "status",
    },
    documentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "document_name",
    },
    reassignedFlag: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
      field: "reassigned_flag",
    },
    assignedTo: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "assigned_to",
    },
    isFileScanned: {
      type: DataTypes.ENUM("1", "0", "2", "3"),
      allowNull: true,
      defaultValue: "0",
      field: "is_file_scaned",
      comment: "0 => NOT Scanned, 1 => Scanned, 2 => malware-infected, 3 => Other Issue",
    },
    cronAssignedTo: {
      type: DataTypes.ENUM("cron1", "cron2", "cron3"),
      allowNull: true,
      field: "cron_assigned_to",
    },
    isAddedFrom: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      field: "is_added_from",
      comment: "0 => 'eportal', 1 => 'Ecourt'",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "createddate",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "modifiedddate",
    },
  },
  {
    tableName: "external_documents",
    timestamps: false,
    freezeTableName: true,
  }
);

export default ExternalDocuments;
