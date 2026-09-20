import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';
import { logger } from "../../../config/winstonLogger.js";

const V2_5_Calendar_Hearing_Info = mysqlSequelize.define(
  'v2_5_calendar_hearing_info',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    calendarId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'calendar_id',
    },
    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'judge_id',
    },
    cmaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'cma_id',
    },
    courtLocationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'court_location_id',
    },
    hearingDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'hearing_date',
    },
    timeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'time_id',
    },
    noOfCases: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'no_of_cases',
    },
    cutoffDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'cutoff_date',
    },
  },
  {
    // Use existing table, don't create or modify
    timestamps: false, // Disable createdAt and updatedAt if not in existing table
    freezeTableName: true, // Use exact table name as specified
  }
);

V2_5_Calendar_Hearing_Info.sync({ alter: false })
  .then(() => {
    logger.info("v2_5_calendar_hearing_info table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing v2_5_calendar_hearing_info table:", error);
  });

export default V2_5_Calendar_Hearing_Info;

