import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const HearingTime = mysqlSequelize.define(
  "hearingtime",
  {
    timeId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "timeid",
    },
    hearingTimeStored: {
      type: DataTypes.TIME,
      allowNull: false,
      field: "heringtimestored",
    },
    hearingTime: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "hearingtime",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
  },
  {
    // Use existing table, don't create or modify
    timestamps: false, // Disable createdAt and updatedAt if not in existing table
    freezeTableName: true, // Use exact table name as specified
  }
);

HearingTime.sync({ alter: false })
  .then(() => {
    logger.info("hearingtime table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing hearingtime table:", error);
  });

export default HearingTime;
