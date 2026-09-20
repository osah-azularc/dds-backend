import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Documents = mysqlSequelize.define(
  "Form1Documents",
  {
    documentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "documentid",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "form1_id",
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agency_id",
    },
    documentType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "document_type",
    },
    documentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "document_name",
    },
    documentFilePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "document_file_path",
    },
    isScanned: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "is_scanned",
    },
    cronAssignedTo: {
      type: DataTypes.ENUM("cron1", "cron2", "cron3"),
      allowNull: true,
      field: "cron_assigned_to",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "created_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
  },
  {
    tableName: "form1_documents",
    timestamps: false,
  }
);

export default Form1Documents;


