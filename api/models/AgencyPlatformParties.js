import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AgencyPlatformParties = mysqlSequelize.define(
  "AgencyPlatformParties",
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "name",
    },
    ecourtTypeOfContact: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "ecourt_typeofcontact",
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "file_name",
    },
    isRequired: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_required",
    },
    showInEcourt: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "1",
      field: "show_in_ecourt",
    },
    isAutopopulate: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "is_autopopulate",
    },
    isCasename: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_casename",
    },
  },
  {
    tableName: "agency_platform_parties",
    timestamps: false,
  }
);

export default AgencyPlatformParties;
