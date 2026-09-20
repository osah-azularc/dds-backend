import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Agency = mysqlSequelize.define(
  "Agency",
  {
    agencyId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "AgencyID",
    },
    agencyCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Agencycode",
    },
    agencyDescription: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Agencydescription",
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "lastname",
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "firstname",
    },
    middleName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "middlename",
    },
    address1: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "address1",
    },
    address2: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "address2",
    },
    city: {
      type: DataTypes.STRING(25),
      allowNull: true,
      field: "city",
    },
    state: {
      type: DataTypes.STRING(25),
      allowNull: true,
      field: "state",
    },
    zip: {
      type: DataTypes.STRING(15),
      allowNull: true,
      field: "zip",
    },
    phone: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "phone",
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "email",
    },
    fax: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "fax",
    },
    isActive: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "1",
      allowNull: false,
      field: "is_active",
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
    tableName: "agency",
    timestamps: false, // Disable automatic timestamps since we use custom fields
  },
);

export default Agency;
