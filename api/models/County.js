import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const County = mysqlSequelize.define(
  "County",
  {
    countyId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "CountyID",
    },
    countyDescription: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Countydescription",
    },
  },
  {
    tableName: "county",
    timestamps: false,
    freezeTableName: true,
  }
);

export default County;