import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { logger } from "../../config/winstonLogger.js";

// NotificationMaster model
const NotificationMaster = mysqlSequelize.define("NotificationMaster", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  notification_type: {
    type: DataTypes.STRING,
  },
  entry_id: {
    type: DataTypes.STRING,
  },
  other_details: {
    type: DataTypes.STRING,
  },
  notification_msg: {
    type: DataTypes.STRING,
  },
  notification_comment: {
    type: DataTypes.STRING,
  },
  file_name: {
    type: DataTypes.STRING,
  },

  created_by: {
    type: DataTypes.INTEGER,
  },
  created_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

// NotificationAction model
const NotificationAction = mysqlSequelize.define("NotificationAction", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  notification_id: {
    type: DataTypes.INTEGER,
  },
  user_email: {
    type: DataTypes.STRING,
  },
  is_starred: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_older: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_cleared: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_viewed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

// Sync all models
// db.sync()
//   .then(() => logger.info("All models have been synced"))
//   .catch((error) => logger.error("Error syncing models:", error));

NotificationMaster.sync({ alter: false })
  .then(() => {
    logger.info("NotificationMaster table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing NotificationMaster table:", error);
  });
NotificationAction.sync({ alter: false })
  .then(() => {
    logger.info("NotificationAction table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing NotificationAction table:", error);
  });

export { NotificationMaster, NotificationAction };
