import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AttorneyByCase = mysqlSequelize.define(
  'AttorneyByCase',
  {
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'caseid',
    },
    typeOfContact: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'typeofcontact',
    },
    attorneyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'attorneyid',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'docket_caseid',
    },
    mailToReceive: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'mailtoreceive',
    },
    mailToReceive1: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'mailtoreceive1',
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'lastname',
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'firstname',
    },
    middleName: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'middlename',
    },
    attorneyBar: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'AttorneyBar',
    },
    phone: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'phone',
    },
    fax: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'Fax',
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'email',
    },
    city: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'city',
    },
    state: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'state',
    },
    zip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'zip',
    },
    address1: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'address1',
    },
    address2: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'address2',
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Title',
    },
    sno: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'sno',
    },
    company: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Company',
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
    externalUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'external_userid',
    },
    isInternationalAddr: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_international_addr',
    },
    internationalAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'international_address',
    },
    eServices: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'e_services',
    },
  },
  {
    tableName: 'attorneybycase',
    timestamps: false,
  }
);

export default AttorneyByCase;
