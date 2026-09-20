import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const EcourtExternalDocuments = mysqlSequelize.define(
  "EcourtExternalDocuments",
  {
    documentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "document_id",
    },
    documentStableId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "document_stable_id",
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
    dateRequested: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "date_requested",
    },
    documentFilePath: {
      type: DataTypes.STRING(250),
      allowNull: true,
      field: "document_file_path",
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
    isFileScaned: {
      type: DataTypes.ENUM("0", "1", "2", "3"),
      allowNull: true,
      defaultValue: "0",
      field: "is_file_scaned",
    },
    cronAssignedTo: {
      type: DataTypes.ENUM("cron1", "cron2", "cron3"),
      allowNull: true,
      field: "cron_assigned_to",
    },
    createdTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: "created_time",
    },
    fileScanStartTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: "file_scan_start_time",
    },
    fileScanEndTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: "file_scan_end_time",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "created_by",
    },
    eportalCreatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "eportal_created_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "createddate",
    },
    fileAddedFrom: {
      type: DataTypes.ENUM("1", "2", "3"),
      allowNull: true,
      defaultValue: "1",
      field: "file_added_from",
    },
  },
  {
    tableName: "ecourt_external_documents",
    timestamps: false,
  }
);

export default EcourtExternalDocuments;

