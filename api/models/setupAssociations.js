import PartyType from "./admin/partyTypeModel.js";
import {
  NotificationAction,
  NotificationMaster,
} from "./NotificationsModel.js";
import PartyDetailsMaster from "./admin/partyDetailsMasterModel.js";
import "./associations/documentTemplateAssociations.js";
import "./associations/calendarAssociations.js";

// Define the association
NotificationMaster.hasMany(NotificationAction, {
  foreignKey: "notification_id",
  as: "notificationAction",
  onDelete: "CASCADE",
});
NotificationAction.belongsTo(NotificationMaster, {
  foreignKey: "notification_id",
  as: "notificationMaster",
});

PartyDetailsMaster.belongsTo(PartyType, {
  foreignKey: "party_type",
  as: "party_master_details_party_type",
});
