import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const HearingMode = mysqlSequelize.define(
  "HearingMode",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    hearingValues: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: "HearingValues",
    },
  },
  {
    tableName: "hearingmode",
    timestamps: false,
  }
);

export default HearingMode;
