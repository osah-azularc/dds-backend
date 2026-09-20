import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const CasteTypeGroups = mysqlSequelize.define(
  "casetypegroups",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    casetypegroup: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    // Use existing table, don't create or modify
    timestamps: false, // Disable createdAt and updatedAt if not in existing table
    freezeTableName: true, // Use exact table name as specified
  }
);

CasteTypeGroups.sync({ alter: false })
  .then(() => {
    logger.info("CasteTypeGroups table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing CasteTypeGroups table:", error);
  });

export default CasteTypeGroups;
