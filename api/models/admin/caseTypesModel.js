import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const caseTypes = mysqlSequelize.define(
  "casetypes",
  {
    Casetypeid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
    },
    AgencyID: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    CaseCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    Casefiletype: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    Casedescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    SOP: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    Active: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
    },
    Agencycode: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    modified_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    modified_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "casetypes",
    timestamps: false,
    freezeTableName: true,
  }
);

export default caseTypes;
