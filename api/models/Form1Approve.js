import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Approve = mysqlSequelize.define(
  "Form1Approve",
  {
    approveId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "approve_id",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "form1_id",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "reason",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    createdModified: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_modified",
    },
  },
  {
    tableName: "form1_approve",
    timestamps: false,
  }
);

export default Form1Approve;
