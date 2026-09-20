import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const DocumentTypes = mysqlSequelize.define("documenttypes", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  documenttype: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // This call will decide the type of document is Decision or Non-Decision or any other
  public_access_flag: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

DocumentTypes.sync({ alter: false })
  .then(() => {
    logger.info("DocumentTypes table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing DocumentTypes table:", error);
  });

export default DocumentTypes;
