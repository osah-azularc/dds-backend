import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const PeopleDetails = mysqlSequelize.define(
  'PeopleDetails',
  {
      peopleId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        field: 'peopleid', // Map to the database column
      },
      typeOfContact: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'typeofcontact',
      },
      caseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'caseid',
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
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'email',
      },
      phone: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'phone',
      },
      docketCaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'docket_caseid',
      },
      fax: {
        type: DataTypes.STRING(60),
        allowNull: true,
        field: 'fax',
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
      title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'Title',
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
      altAddress1: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'alt_address1',
      },
      altAddress2: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'alt_address2',
      },
      altCity: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'alt_city',
      },
      altState: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'alt_state',
      },
      altZipCode: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'alt_zip_code',
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
      tableName: 'peopledetails',
      timestamps: false,
      freezeTableName: true,
    }
);

export default PeopleDetails;
