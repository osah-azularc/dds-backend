
import Notification from "../Notification.js";
import NotificationAction from "../NotificationAction.js";
import DocketNotifications from "../DocketNotifications.js";
import Docket from "../Docket.js";
import DocumentsTable from "../DocumentsTable.js";
import CheckinCalendarTodayDate from "../CheckinCalendarTodayDate.js";
import AttachmentPaths from "../AttachmentPathsModel.js";

/**
 * Define all notification-related associations
 */
export const setupNotificationAssociations = () => {
  // Notification to NotificationAction
  Notification.hasOne(NotificationAction, {
    foreignKey: "notification_id",
    sourceKey: "notificationId",
    as: "notification_action",
  });

  NotificationAction.belongsTo(Notification, {
    foreignKey: "notification_id",
    as: "notifications",
  });

  // Notification to DocketNotifications
  Notification.belongsTo(DocketNotifications, {
    foreignKey: "caseid",
    targetKey: "caseId",
    as: "docket_notifications",
  });

  DocketNotifications.hasMany(Notification, {
    foreignKey: "caseid",
    sourceKey: "caseId",
    as: "notifications",
  });

  // Notification to Docket
  Notification.belongsTo(Docket, {
    foreignKey: "caseid",
    targetKey: "caseId",
    as: "docket",
  });

  // Notification to DocumentsTable
  Notification.belongsTo(DocumentsTable, {
    foreignKey: "doc_id",
    targetKey: "documentId",
    as: "documents_table",
  });

  DocumentsTable.hasMany(Notification, {
    foreignKey: "doc_id",
    sourceKey: "documentId",
    as: "notifications",
  });

  // Notification to CheckinCalendarTodayDate
  Notification.belongsTo(CheckinCalendarTodayDate, {
    foreignKey: "caseid",
    targetKey: "docketCaseId",
    as: "checkin_calendar_today_date",
  });

  // DocumentsTable to AttachmentPaths
  DocumentsTable.hasMany(AttachmentPaths, {
    foreignKey: "documentid",
    sourceKey: "documentId",
    as: "attachmentPaths",
  });

  AttachmentPaths.belongsTo(DocumentsTable, {
    foreignKey: "documentid",
    targetKey: "documentId",
    as: "documentsTable",
  });
};

