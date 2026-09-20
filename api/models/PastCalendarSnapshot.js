import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

/*
  Created by  : Cascade
  Date        : 2026-08-27
  Description : Frozen historical record of a day's hearing dockets. Populated in two
                phases by pastCalendarInactiveSnapshotService.js (Job 1 - runs ON the
                hearing day, plants a docket_caseid + hearing_date placeholder for every
                case being heard today so nothing is missed) and
                pastCalendarActiveSnapshotService.js (Job 2 - runs the day AFTER, fills in
                the complete end-of-day state - including anything entered during
                check-in - and flips active_past_calendar to '1', at which point the row
                is a permanent, read-only record; see checkinGuard.js).

                Every data column besides docket_caseid/hearing_date/active_past_calendar/
                created_* is left NULL by Job 1 on purpose, so Job 2 can tell "not yet
                completed" placeholder rows apart from real data (its own UPDATE guard
                checks judge_name IS NULL for exactly this reason).
*/
const PastCalendarSnapshot = mysqlSequelize.define(
  "PastCalendarSnapshot",
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
    // '0' Inactive/placeholder (Job 1 only), '1' Active/complete - the frozen final
    // state (Job 2). Once '1', checkinGuard.js blocks any further check-in edits.
    activePastCalendar: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "active_past_calendar",
    },
    caseName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: "case_name",
    },
    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "judge_id",
    },
    judgeName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "judge_name",
    },
    cma: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "cma",
    },
    county: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "county",
    },
    casetypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "casetype_id",
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
    hearingTime: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "hearing_time",
    },
    agency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency",
    },
    agencyReferenceNumber: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency_reference_number",
    },
    docketStatus: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "docket_status",
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
      allowNull: true,
      field: "attendance_status",
      comment: "0: Hearing Schedule, 1: Partially Arrived, 2: Arrived, 3: Ready for Hearing",
    },
    notes: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
      field: "notes",
    },
    circuitId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "circuit_id",
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
    tableName: "past_calendar_snapshot",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      // Backstops Job 1's app-level "does a row already exist" check against a race
      // between two overlapping runs (scheduled + manual re-run) - a second INSERT for
      // the same case/date fails here instead of duplicating the placeholder.
      {
        name: "uniq_past_calendar_snapshot_case_date",
        unique: true,
        fields: ["docket_caseid", "hearing_date"],
      },
    ],
  }
);

PastCalendarSnapshot.sync({ alter: false });

export default PastCalendarSnapshot;
