import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

// Per-party, per-hearing physical check-in log - one row per party
// (Petitioner / Petitioner Attorney / Respondent Attorney / Case Official,
// see PARTY_NAME in checkinInfoListService.js) that has actually checked in
// for a docket's hearing today. checkinInfoListService.js reads this to
// answer the 4 *_checkin flags on the Check-In Info list (existence of a
// matching row with attendance_status='1' = checked in).
const AttendanceStatusTodayDate = mysqlSequelize.define(
  "AttendanceStatusTodayDate",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "docket_caseid",
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
    partyName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "partyname",
    },
    attendanceStatus: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
      field: "attendance_status",
      comment: "1: checked in",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
  },
  {
    tableName: "attendance_status_today_date",
    timestamps: false,
    freezeTableName: true,
  }
);

export default AttendanceStatusTodayDate;
