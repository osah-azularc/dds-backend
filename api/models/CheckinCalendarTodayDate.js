import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const CheckinCalendarTodayDate = mysqlSequelize.define(
  "checkin_calendar_today_date",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },

    caseName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "case_name",
    },

    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "docket_caseid",
    },

    caseTypeId: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "casetype_id",
    },

    circuitId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "circuit_id",
    },

    agency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency",
    },

    judgeName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "judge_name",
    },

    county: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "county",
    },

    hearingSite: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "hearing_site",
    },

    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "judge_id",
    },

    caseType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "case_type",
    },

    petitionerAttorney: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "petitioner_attorney",
    },

    petOrRep: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "pet_or_rep",
    },

    respondentAttorney: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "respondent_attorney",
    },

    caseOfficial: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "case_official",
    },

    attendanceStatus: {
      type: DataTypes.ENUM("0", "1", "2", "3"),
      defaultValue: "0",
      field: "attendance_status",
      comment:
        "0: Hearing Schedule, 1: Partially Arrived, 2: Arrived, 3: Ready for Hearing",
    },

    docketStatus: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "docket_status",
    },

    agencyReferenceNumber: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency_reference_number",
    },

    cma: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "cma",
    },

    startCheckin: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
      field: "start_checkin",
    },

    hearingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "hearing_date",
    },

    hearingTime: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "hearing_time",
    },

    notes: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
      field: "notes",
    },

    docketStatusUpdatedToday: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
      field: "docket_status_updated_today",
    },

    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },

    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },

    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
  },
  {
    tableName: "checkin_calendar_today_date",
    timestamps: false,
    freezeTableName: true,
  }
);

export default CheckinCalendarTodayDate;
