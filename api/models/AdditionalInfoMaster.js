import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AdditionalInfoMaster = mysqlSequelize.define(
  "AdditionalInfoMaster",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "label",
    },
    agencyPlatformId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "agency_platform_id",
    },
  },
  {
    tableName: "additionalinfo_master",
    timestamps: false,
  }
);

export default AdditionalInfoMaster;
