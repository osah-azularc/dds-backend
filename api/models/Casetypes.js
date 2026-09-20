import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Casetypes = mysqlSequelize.define(
  "Casetypes",
  {
    caseTypeId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
      field: "Casetypeid",
    },
    agencyId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "AgencyID",
    },
    caseCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "CaseCode",
    },
    caseFileType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "Casefiletype",
    },
    caseDescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "CaseDescription",
    },
    sop: {
      type: DataTypes.INTEGER(50),
      allowNull: true,
      field: "SOP",
    },
    active: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
      field: "Active",
    },
    agencyCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "Agencycode",
    },
    isActive: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
      field: "is_active",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
  },
  {
    tableName: "casetypes",
    timestamps: false,
    freezeTableName: true,
    underscored: false,
  }
);

export default Casetypes;
