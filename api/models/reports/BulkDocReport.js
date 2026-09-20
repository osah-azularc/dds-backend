import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const BulkDocReport = mysqlSequelize.define(
  "BulkDocReport",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "caseid",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "userid",
    },
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "documentid",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
  },
  {
    tableName: "bulkdoc_report",
    timestamps: false,
  }
);

export default BulkDocReport;

