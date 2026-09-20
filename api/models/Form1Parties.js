import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Parties = mysqlSequelize.define(
  "Form1Parties",
  {
    partyId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "party_id",
    },
    typeOfContact: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "typeofcontact",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "form1_id",
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agency_id",
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
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "middlename",
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "title",
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
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "city",
    },
    state: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "state",
    },
    zip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "zip",
    },
    email: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "email",
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: "phone",
    },
    fax: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: "fax",
    },
    position: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "position",
    },
    georgiaBarNo: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "georgia_bar_no",
    },
    isNewContact: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
      field: "is_new_contact",
    },
    relationshipToApplicantRecipient: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "relationship_to_applicant_recipient",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    company: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "company",
    },
    altAddress1: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "alt_address1",
    },
    altAddress2: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "alt_address2",
    },
    altCity: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "alt_city",
    },
    altState: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "alt_state",
    },
    altZipCode: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "alt_zip_code",
    },
    isGeorgiaState: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_georgia_state",
    },
    mailToReceive: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: "mailtoreceive",
    },
    mailToReceive1: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: "mailtoreceive1",
    },
    sno: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "sno",
    },
    badgeNo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "badge_no",
    },
    externalUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "external_userid",
    },
    contactId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "contactid",
    },
    attorneyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "attorneyid",
    },
    attorneyBar: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "attorneybar",
    },
    isInternationalAddr: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_international_addr",
    },
    internationalAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "international_address",
    },
  },
  {
    tableName: "form1_parties",
    timestamps: false,
  }
);

export default Form1Parties;
