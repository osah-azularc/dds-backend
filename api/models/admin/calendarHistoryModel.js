import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const CalendarHistory = mysqlSequelize.define(
  "calendarhistory",
  {
    auditid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    Description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ModifiedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    CalendarId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_frontend_history: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "1",
    },
    is_old_cal: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_time: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "calendarhistory",
    timestamps: false,
  }
);

CalendarHistory.sync({ alter: false })
  .then(() => {
    logger.info("calendarhistory table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing calendarhistory table:", error);
  });

export default CalendarHistory;
