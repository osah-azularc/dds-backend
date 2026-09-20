import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const AgencyPlatform = mysqlSequelize.define(
  "AgencyPlatform",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id",
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "name",
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "slug",
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agency_id",
    },
  },
  {
    tableName: "agency_platform",
    timestamps: false,
  }
);
AgencyPlatform.sync({ alter: false })
  .then(() => {
    logger.info("AgencyPlatform table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing AgencyPlatform table:", error);
  });

export default AgencyPlatform;
