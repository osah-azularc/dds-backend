import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AgencyCaseworkerByCase = mysqlSequelize.define(
  'AgencyCaseworkerByCase',
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
    contactId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'contactid',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'Docket_caseid',
    },
    mailToReceive1: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'mailtoreceive1',
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Title',
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
      type: DataTypes.STRING(15),
      allowNull: true,
      field: 'Zip',
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Email',
    },
    fax: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'Fax',
    },
    phone: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'Phone',
    },
    attorneyBar: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'AttorneyBar',
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Lastname',
    },
    middleName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Middlename',
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'Firstname',
    },
    mailToReceive: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'mailtoreceive',
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
    isGeorgiaState: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_georgia_state',
    },
    badgeNo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'badge_no',
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
    tableName: 'agencycaseworkerbycase',
    timestamps: false,
  }
);

export default AgencyCaseworkerByCase;
