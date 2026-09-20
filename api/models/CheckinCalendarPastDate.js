import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

// The archived, per-docket snapshot of a past hearing's check-in/attendance
// state - one row per docket case that was checked in on some past
// hearing_date. Distinct table from checkin_calendar_today_date: no
// start_checkin/docket_status_updated_today columns (those only make sense
// for "today"'s live queue) - instead active_past_calendar marks a row as
// belonging to the archived past-calendar view, mirroring the legacy PHP
// OsahPastCalendarModel's "active_past_calendar = 1" filter. Read by
// pastCheckinInfoListService.js (PastCalendarInfoPage's read-only "View
// Check-in" grid) - see that file for the query.
const CheckinCalendarPastDate = mysqlSequelize.define(
  "checkin_calendar_past_date",
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

    circuitId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "circuit_id",
    },

    county: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "county",
    },

    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "casetype_id",
    },

    agency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency",
    },

    caseType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "case_type",
    },

    hearingSite: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "hearing_site",
    },

    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "judge_id",
    },

    judgeName: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "judge_name",
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

    activePastCalendar: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
      field: "active_past_calendar",
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
    tableName: "checkin_calendar_past_date",
    timestamps: false,
    freezeTableName: true,
  }
);

export default CheckinCalendarPastDate;
