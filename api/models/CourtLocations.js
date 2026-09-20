import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const CourtLocations = mysqlSequelize.define(
  "CourtLocations",
  {
    courtLocationId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "courtlocationid",
    },
    locationName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Locationname",
    },
    address1: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Address1",
    },
    address2: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Address2",
    },
    city: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "City",
    },
    state: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "State",
    },
    zip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "Zip",
    },
    tel: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "Tel",
    },
    fax: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "Fax",
    },
    siteContact: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "sitecontact",
    },
    siteEmail: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "siteemail",
    },
    active: {
      type: DataTypes.STRING(15),
      allowNull: true,
      field: "Active",
    },
    isActive: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
      field: "is_active",
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "firstname",
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "lastname",
    },
    middleName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "middlename",
    },
    email: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "email",
    },
    county: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "county",
    },
    createdBy: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "modified_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
  },
  {
    tableName: "courtlocations",
    timestamps: false, // Disable automatic timestamps since we use custom fields
    freezeTableName: true, // Prevent Sequelize from pluralizing table name
  },
);

export default CourtLocations;
