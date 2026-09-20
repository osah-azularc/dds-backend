import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

// Lookup table for checkin_calendar_today_date.attendance_status (see
// CheckinCalendarTodayDate's attendanceStatus enum comment: 0 Hearing
// Scheduled / 1 Partially Arrived / 2 Arrived / 3 Ready for Hearing) -
// joined in checkinInfoListService.js to resolve the display label.
const AttendanceStatusMaster = mysqlSequelize.define(
  "AttendanceStatusMaster",
  {
    status: {
      type: DataTypes.STRING(5),
      primaryKey: true,
      allowNull: false,
      field: "status",
    },
    statusName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "status_name",
    },
  },
  {
    tableName: "attendance_status_master",
    timestamps: false,
    freezeTableName: true,
  }
);

export default AttendanceStatusMaster;
