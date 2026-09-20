import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const HearingDateSkip = mysqlSequelize.define(
  "hearingdateskip",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id",
    },
    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "casetypeid",
    },
  },
  {
    timestamps: false,
    freezeTableName: true,
  }
);

HearingDateSkip.sync({ alter: false })
  .then(() => {
    logger.info("HearingDateSkip table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing HearingDateSkip table:", error);
  });

export default HearingDateSkip;

