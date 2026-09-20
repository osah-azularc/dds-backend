import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AdditionalInfo = mysqlSequelize.define(
  "AdditionalInfo",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    additionalInfoId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "additionalinfo_id",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "form1_id",
    },
  },
  {
    tableName: "additionalinfo",
    timestamps: false,
  }
);

export default AdditionalInfo;
