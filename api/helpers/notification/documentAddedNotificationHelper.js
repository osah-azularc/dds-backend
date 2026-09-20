/**
 * Created by  : Cascade
 * Date        : 2026-09-12
 * Description : Shared "a document was added to this docket" bell-notification helper.
 *
 * Used by every document-add path that should notify docket followers:
 *   - Files          : direct upload  (docketDetailPageDocumentController.addDocument)
 *   - Document Templates : NOH / Disposition / Continuance quick actions
 *   - eFiling        : approved e-filed document (efilingNotificationService — has its own
 *                       copy of the same fan-out logic; kept separate there to avoid touching
 *                       that already-verified flow, but the two are intentionally identical)
 *
 * The bell feed (notificationHelper.getSystemNotifications) INNER-JOINs
 *   notifications -> notification_action (this user) -> docket_notifications (this user)
 * so creating a `notifications` row alone is invisible to a follower until that follower
 * also has a `notification_action` row pointing at it. notifyDocketFollowers seeds one.
 *
 * EXCLUDED_NOTIFICATION_DOCUMENT_TYPES below (checked in createDocumentAddedNotification)
 * silently skips the whole notification for certain document types on all three of the
 * paths above; efilingNotificationService.createEfilingDocNotification applies the same
 * check independently since it doesn't call createDocumentAddedNotification.
 */

import { Op } from 'sequelize';
import Notification from '../../models/Notification.js';
import NotificationAction from '../../models/NotificationAction.js';
import DocketNotifications from '../../models/DocketNotifications.js';
import { logger } from '../../../config/winstonLogger.js';

/**
 * Document types that never trigger a bell notification for docket followers —
 * the document itself still gets added to the docket normally, just no
 * notification. Mirrors legacy PHP NotificationsFileModel::_excludedDocType().
 * Matched case-insensitively/trimmed since documentType strings come from
 * admin-managed template names with inconsistent casing/spacing.
 */
const EXCLUDED_NOTIFICATION_DOCUMENT_TYPES = new Set(
  [
    'NOH',
    'NoticeofHearing',
    'Notice Of Hearing',
    'B-NOH',
    'NOH-Motion',
    'T-NOH',
    'Continuance',
    'Decision',
    'Order',
    'Stay Order',
    'Transfer Order',
    'Vacate Order',
  ].map((type) => type.toLowerCase()),
);

/**
 * @param {string} [documentType]
 * @returns {boolean} true if this document type must never produce a bell notification
 */
export const isExcludedNotificationDocumentType = (documentType) =>
  EXCLUDED_NOTIFICATION_DOCUMENT_TYPES.has(String(documentType || '').trim().toLowerCase());

/**
 * Fan an in-app notification out to every user following the docket via "Notify Me"
 * (docket_notifications.users_following = '1').
 *
 * @param {number} notificationId - the notifications.notification_id just created
 * @param {number} caseId         - docket the notification belongs to
 * @param {number} [actorUserId]  - user who triggered it; excluded from the fan-out
 * @returns {Promise<number>} count of follower action rows created
 */
export async function notifyDocketFollowers(notificationId, caseId, actorUserId) {
  if (!notificationId || !caseId) return 0;

  const followers = await DocketNotifications.findAll({
    where: {
      caseId,
      usersFollowing: '1',
      ...(actorUserId ? { userId: { [Op.ne]: actorUserId } } : {}),
    },
    attributes: ['userId'],
    raw: true,
  });

  if (followers.length === 0) return 0;

  // A docket can hold more than one follow row for the same user over time;
  // only seed one action row per user.
  const uniqueUserIds = [...new Set(followers.map((f) => f.userId).filter(Boolean))];
  if (uniqueUserIds.length === 0) return 0;

  const now = new Date();
  await NotificationAction.bulkCreate(
    uniqueUserIds.map((followerUserId) => ({
      notificationId,
      userId: followerUserId,
      isStarred: '0',
      isViewed: '0',
      isEmailSent: '0',
      createdDate: now,
    })),
  );

  logger.info(`Seeded ${uniqueUserIds.length} docket-follower notification(s)`, {
    notificationId,
    caseId,
  });

  return uniqueUserIds.length;
}

/**
 * Create a "document added" bell notification for a docket and fan it out to
 * every follower. Never throws — a failure here must never block the document
 * upload/generation flow that called it; callers can still catch/log if they want.
 *
 * @param {Object} params
 * @param {number} params.caseId
 * @param {number} [params.docId] - documentstable.documentid (or 0 if not applicable)
 * @param {string} [params.documentType] - e.g. 'NOH', 'Decision', 'Continuance', or a
 *   user-entered type for a direct file upload
 * @param {number} [params.actorUserId] - user who added the document; excluded from fan-out
 * @returns {Promise<number|null>} the created notification's id, or null on failure/no-op
 */
export async function createDocumentAddedNotification({ caseId, docId, documentType, actorUserId }) {
  try {
    if (!caseId) return null;

    if (isExcludedNotificationDocumentType(documentType)) {
      logger.info(`Skipping bell notification — excluded document type "${documentType}"`, { caseId, docId });
      return null;
    }

    const notification = await Notification.create({
      notificationType: 'document_info',
      actionTrigger: 1,
      notificationMsg: `A new ${documentType || 'Document'} has been added.`,
      caseId,
      docId: docId || 0,
      createdDate: new Date(),
      createdBy: actorUserId,
    });

    await notifyDocketFollowers(notification.notificationId, caseId, actorUserId);

    return notification.notificationId;
  } catch (error) {
    logger.error('Failed to create document-added notification:', {
      error: error.message,
      caseId,
      docId,
      documentType,
    });
    return null;
  }
}
