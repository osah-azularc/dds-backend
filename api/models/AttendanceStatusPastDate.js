import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

// Per-party, per-hearing physical check-in log for a *past* hearing date -
// one row per party (Petitioner / Petitioner Attorney / Respondent Attorney
// / Case Official) that had actually checked in for a docket's hearing on
// that day. Archived counterpart of attendance_status_today_date; distinct
// table (not just a differently-filtered query against the "today" one).
// pastCheckinInfoListService.js reads this the same way
// checkinInfoListService.js reads attendance_status_today_date: existence of
// a matching row with attendance_status='1' = that party checked in.
const AttendanceStatusPastDate = mysqlSequelize.define(
  "attendance_status_past_date",
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
      allowNull: false,
      field: "hearing_date",
    },
    hearingTime: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "hearing_time",
    },
    partyTypeContact: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "party_type_contact",
    },
    partyTypeTablename: {
      type: DataTypes.ENUM(
        "agencycaseworkerbycase",
        "attorneybycase",
        "peopledetails",
        "minordetails",
      ),
      allowNull: true,
      field: "party_type_tablename",
    },
    partyName: {
      type: DataTypes.STRING(100),
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
    tableName: "attendance_status_past_date",
    timestamps: false,
    freezeTableName: true,
  }
);

export default AttendanceStatusPastDate;
