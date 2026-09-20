import { DataTypes } from 'sequelize';
import { mysqlSequelize } from '../../connections/seqDB.js';
import { logger } from "../../config/winstonLogger.js";

const Notification = mysqlSequelize.define(
  'Notification',
  {
    notificationId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'notification_id',
    },
    notificationType: {
      type: DataTypes.ENUM(
        'document_info',
        'hearing_info',
        'calendar_info',
        'timeliness1_info',
        'timeliness2_info',
        'timeliness3_info'
      ),
      allowNull: false,
      field: 'notification_type',
    },
    actionTrigger: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
      field: 'action_trigger',
    },
    notificationMsg: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'notification_msg',
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'caseid',
    },
    docId: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'doc_id',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_date',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by',
    },
  },
  {
    tableName: 'notifications',
    timestamps: false,
    freezeTableName: true,
    indexes: [
      {
        name: 'idx_caseid',
        fields: ['caseid'],
      },
    ],
  }
);

Notification.sync({ alter: false })
  .then(() => {
    logger.info("Notification table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing Notification table:", error);
  });

export default Notification;
