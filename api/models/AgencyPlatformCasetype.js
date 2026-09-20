import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AgencyPlatformCasetype = mysqlSequelize.define(
  "AgencyPlatformCasetype",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    agencyPlatformId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agency_platform_id",
    },
    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "casetype",
    },
  },
  {
    tableName: "agency_platform_casetype",
    timestamps: false,
  }
);

export default AgencyPlatformCasetype;
