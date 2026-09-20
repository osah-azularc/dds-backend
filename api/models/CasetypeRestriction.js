import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const CasetypeRestriction = mysqlSequelize.define(
  "CasetypeRestriction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    agency: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'if Agency is null then it will be a default all agency',
      field: "agency",
    },
    caseType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "casetype",
    },
    noHearing: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "no_hearing",
    },
    noHearingType: {
      type: DataTypes.ENUM('calendar', 'bussiness'),
      allowNull: false,
      defaultValue: 'calendar',
      comment: '1 for bussiness days and 0 for calendar days',
      field: "no_hearing_type",
    },
    noHearingCalcFrom: {
      type: DataTypes.ENUM('datereceivedbyOSAH', 'daterequested'),
      allowNull: true,
      defaultValue: 'datereceivedbyOSAH',
      field: "no_hearing_calc_from",
    },
    noDecision: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "no_decision",
    },
    noDecisionType: {
      type: DataTypes.ENUM('calendar', 'bussiness', 'dayOFMonth'),
      allowNull: false,
      defaultValue: 'calendar',
      comment: '1 for bussiness days and 0 for calendar days',
      field: "no_decision_type",
    },
    noDecisionCalcFrom: {
      type: DataTypes.ENUM('datereceivedbyOSAH', 'daterequested', 'hearingdate'),
      allowNull: true,
      defaultValue: 'hearingdate',
      field: "no_decision_calc_from",
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
    tableName: "casetype_restriction",
    timestamps: false, // We're using custom created_date and modified_date fields
    freezeTableName: true, // Use exact table name as specified
  }
);

export default CasetypeRestriction;

