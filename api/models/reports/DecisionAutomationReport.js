import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const DecisionAutomationReport = mysqlSequelize.define(
  "DecisionAutomationReport",
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
      allowNull: false,
      field: "caseid",
    },

    caseName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "casename",
    },

    automationSubType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "automation_sub_type",
    },

    status: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "status",
    },

    cma: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "cma",
    },

    judge: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "judge",
    },

    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agencyid",
    },

    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "casetypeid",
    },

    hearingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "hearing_date",
    },

    dateReceived: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "date_received",
    },

    decisionAutomationDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "decision_automation_date",
    },

    automationFlag: {
      type: DataTypes.ENUM("decision", "noh", "continuance"),
      allowNull: true,
      defaultValue: "decision",
      field: "automation_flag",
    },

    bulkDesignationFlag: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "bulk_designation_flag",
    },

    pastHearingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "past_hearing_date",
    },
  },
  {
    tableName: "decision_automation_report",
    timestamps: false,
  }
);

export default DecisionAutomationReport;
