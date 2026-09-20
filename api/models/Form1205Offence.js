import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1205Offence = mysqlSequelize.define(
  "Form1205Offence",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "caseid",
    },
    officerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "officerrid",
    },
    citiation: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "citiation",
    },
    countyOfOccurences: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "county_of_occurences",
    },
    incidentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "incident_date",
    },
    incidentTime: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "incident_time",
    },
    officerBadgeNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "officer_badge_number",
    },
    commercialVehicle: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: "commercial_vehicle",
    },
    hazourdousVehicle: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: "hazourdous_vehicle",
    },
    stateOfIssue: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "state_of_issue",
    },
    licenseClassId: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: "license_class_id",
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "dob",
    },
    restrictions: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "restrictions",
    },
    gender: {
      type: DataTypes.STRING(5),
      allowNull: true,
      field: "gender",
    },
    height: {
      type: DataTypes.STRING(5),
      allowNull: true,
      field: "height",
    },
    weight: {
      type: DataTypes.STRING(5),
      allowNull: true,
      field: "weight",
    },
    driverRequest: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "driver_request",
    },
    telvOFive: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "telv_o_five",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
    dateCreated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "date_created",
    },
    dateCreatedFor91Days: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "date_createdfor91days",
    },
    isNewOfficer: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      field: "is_new_officer",
    },
    isNewAttorney: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      field: "is_new_attorney",
    },
  },
  {
    tableName: "form1205offence",
    timestamps: false,
  }
);

export default Form1205Offence;
