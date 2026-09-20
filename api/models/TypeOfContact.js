import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const TypeOfContact = mysqlSequelize.define(
  "TypeOfContact",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    partyContact: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "partycontact",
    },
    tableName: {
      type: DataTypes.ENUM(
        "agencycaseworkerbycase",
        "attorneybycase",
        "peopledetails",
        "minordetails",
      ),
      allowNull: true,
      field: "tablename",
    },
    isOfficer: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "is_officer",
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
    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "modified_by",
    },
  },
  {
    tableName: "typeofcontact",
    timestamps: false,
  },
);
TypeOfContact.sync({ alter: false });
export default TypeOfContact;
