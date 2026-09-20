import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Summarytable = mysqlSequelize.define(
  "Form1Summarytable",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "form1_id",
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "Docket_caseid",
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "date",
    },
    summaryNotes: {
      type: DataTypes.STRING(10000),
      allowNull: true,
      field: "summarynotes",
    },
    updatedBy: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "updatedby",
    },
    deleted: {
      type: DataTypes.STRING(3),
      allowNull: true,
      field: "deleted",
    },
  },
  {
    tableName: "form1_summarytable",
    timestamps: false,
  }
);

export default Form1Summarytable;
