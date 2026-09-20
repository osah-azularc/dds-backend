import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';
import { logger } from "../../../config/winstonLogger.js";

const V2_5_Calendar = mysqlSequelize.define(
  'v2_5_calendar',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    circuitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'circuit_id',
    },
    caseTypeGroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'casetype_group_id',
    },
  },
  {
    // Use existing table, don't create or modify
    timestamps: false, // Disable createdAt and updatedAt if not in existing table
    freezeTableName: true, // Use exact table name as specified
  }
);

V2_5_Calendar.sync({ alter: false })
  .then(() => {
    logger.info("v2_5_calendar table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing v2_5_calendar table:", error);
  });

export default V2_5_Calendar;
