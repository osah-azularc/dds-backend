import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const V2_5_Circuit = mysqlSequelize.define(
  "v2_5_circuit",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    // Use existing table, don't create or modify
    timestamps: false, // Disable createdAt and updatedAt if not in existing table
    freezeTableName: true, // Use exact table name as specified
  }
);

export default V2_5_Circuit;
