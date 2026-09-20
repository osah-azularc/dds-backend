import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";


const NotificationAction = mysqlSequelize.define(
  "notification_action",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },

    notificationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "notification_id",
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },

    isStarred: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_starred",
    },

    isViewed: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_viewed",
    },

    isEmailSent: {
      type: DataTypes.ENUM("0", "1"),
      defaultValue: "0",
      field: "is_email_sent",
    },

    teId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "te_id",
    },

    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
  },
  {
    tableName: "notification_action",
    timestamps: false,
    freezeTableName: true,
  }
);

export default NotificationAction;
