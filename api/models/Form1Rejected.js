import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Rejected = mysqlSequelize.define(
  "Form1Rejected",
  {
    rejectedId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "rejected_id",
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
    reasonType: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "reason_type",
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
    tableName: "form1_rejected",
    timestamps: false,
  }
);

export default Form1Rejected;

