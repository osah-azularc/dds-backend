import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const UnifiedCases = mysqlSequelize.define(
  "unified_cases",
  {
    casetypeid: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    Flag: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    casefiletyp: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    casetypegroup: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    casetype_group_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    // Use existing table, don't create or modify
    tableName: "unified_cases",
    timestamps: false, // Disable createdAt and updatedAt
    freezeTableName: true, // Use exact table name as specified
  }
);

export default UnifiedCases;
