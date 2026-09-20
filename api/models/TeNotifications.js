import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";


const TENotifications = mysqlSequelize.define(
  "te_notifications",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },

    notificationType: {
      type: DataTypes.ENUM("Approved", "Rejected", "Submitted"),
      allowNull: false,
      field: "notification_type",
    },

    notificationMsg: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "notification_msg",
    },

    timeEntryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "time_entry_id",
    },

    isViewed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "is_viewed",
    },

    isStarred: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "is_starred",
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },

    createdBy: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: "created_by",
    },

    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },

    updatedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: "updated_date",
    },
  },
  {
    tableName: "te_notifications",
    timestamps: false,
    freezeTableName: true,
  }
);

export default TENotifications;
