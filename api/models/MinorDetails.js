import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const MinorDetails = mysqlSequelize.define(
  'MinorDetails',
  {
      minorId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        field: 'Minorid', // Map to the database column
      },
      caseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'caseid',
      },
      lastName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Lastname',
      },
      firstName: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'Firstname',
      },
      middleName: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'Middlename',
      },
      dob: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'dob',
      },
      address1: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Address1',
      },
      address2: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Address2',
      },
      city: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'City',
      },
      state: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'State',
      },
      zip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'Zip',
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Email',
      },
      phone: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'Phone',
      },
      docketCaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'Docket_caseid',
      },
      dobYear: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'dobyear',
      },
      createdDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_date',
      },
      modifiedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'modified_date',
      },
    },
    {
      tableName: 'minordetails',
      timestamps: false,
      freezeTableName: true,
    }
);

export default MinorDetails;
