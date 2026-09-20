/*
  Writes a te_notifications row for a rejected time entry, surfaced in the recipient's
  notification bell -- notificationController.js's getUnreadNotiData already merges
  te_notifications with system notifications (via getTENotifications), this was just never
  written to by the Time Entry module. Matches legacy's TeNotificationsFileModel::
  sendRejectionNotificationById exactly (TimeExpenseController.php:3741-3746) -- legacy only
  ever sends this for Rejected, never Approved/Submitted, despite the notification_type enum
  allowing all three, so this stays reject-only too.

  Also pushes a live WebSocket nudge to the recipient (sendNotification, same pub/sub
  Check-In Info already uses via checkinBroadcast.js/WebSocketContext.jsx) so their bell
  updates immediately instead of waiting for NotificationsPopover.jsx's 60s poll.
*/
import moment from 'moment';
import TENotifications from '../../models/TeNotifications.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import { sendNotification } from '../../websocket/notification.js';
import { logger } from '../../../config/winstonLogger.js';

export async function sendTimeEntryRejectionNotification({ timeEntryId, entryOwnerId, entryDate, actorUserId }) {
  try {
    await TENotifications.create({
      notificationType: 'Rejected',
      notificationMsg: `Your time entry on ${moment(entryDate).format('MM-DD-YYYY')} was rejected`,
      timeEntryId,
      userId: entryOwnerId,
      createdBy: String(actorUserId),
      isViewed: 0,
      isStarred: 0,
    });

    const owner = await JudgeAssistantClerk.findByPk(entryOwnerId, { attributes: ['email'] });
    if (owner?.email) sendNotification({ user_email: owner.email });
  } catch (error) {
    // A failed notification must never undo (or fail) the reject itself -- the entry is
    // already correctly saved and activity-logged by the time this runs.
    logger.error(`Failed to send rejection notification for timeEntryId=${timeEntryId}:`, error);
  }
}

export default sendTimeEntryRejectionNotification;
