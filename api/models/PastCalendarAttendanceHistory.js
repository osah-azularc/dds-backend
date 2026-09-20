import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/*
  Created by  : Cascade
  Date        : 2026-08-27
  Description : Per-party attendance snapshot copied alongside a past_calendar_snapshot
                row when Job 2 (pastCalendarActiveSnapshotService.js) finalizes it - one
                row per party type (Petitioner, Petitioner Attorney, Respondent Attorney,
                Case Worker) recording who they were and whether they'd checked in by end
                of the hearing day. Written only after that row's past_calendar_snapshot
                UPDATE succeeds, so a row here always implies its snapshot is Active.
*/
const PastCalendarAttendanceHistory = mysqlSequelize.define(
  "PastCalendarAttendanceHistory",
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
    // Petitioner | Petitioner Attorney | Respondent Attorney | Case Worker
    partyType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "party_type",
    },
    partyName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: "party_name",
    },
    attendanceStatus: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "attendance_status",
      comment: "1: checked in",
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
  },
  {
    tableName: "past_calendar_attendance_history",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      // One row per party type per finalized hearing day - re-running Job 2 must not
      // duplicate these, so the same guard pattern as past_calendar_snapshot applies.
      {
        name: "uniq_past_calendar_attendance_history_case_date_type",
        unique: true,
        fields: ["docket_caseid", "hearing_date", "party_type"],
      },
    ],
  }
);

PastCalendarAttendanceHistory.sync({ alter: false });

export default PastCalendarAttendanceHistory;
