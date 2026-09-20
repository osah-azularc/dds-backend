import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../config/winstonLogger.js";

const NotificationEmail = mysqlSequelize.define(
  "Notification_Email",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_email: {
      type: DataTypes.STRING,
      unique: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
    },
    option_id: {
      type: DataTypes.INTEGER,
      defaultValues: 1,
    },
  },
  {
    timestamps: false,
  }
);

NotificationEmail.sync({ alter: false })
  .then(() => {
    logger.info("NotificationEmail table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing NotificationEmail table:", error);
  });

export { NotificationEmail };
