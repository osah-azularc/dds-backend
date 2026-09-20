import { NotificationAction, TENotifications } from "../../models/index.js";
import { logger } from "../../../config/winstonLogger.js";

/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Service function used to mark all unread notifications as viewed for a user.
 *               Updates both system notifications and TE notifications.
 *
 * Parameters  :
 *    - userId (Number) : User ID
 *
 * Response    : Returns a Promise<number> — total number of notifications marked as viewed
 */
export const clearAllNotificationsService = async (userId) => {
  try {
    // 1️⃣ Update system notifications using Sequelize model
    // Note: NotificationAction uses ENUM("0", "1") so we pass strings
    const [systemUpdatedCount] = await NotificationAction.update(
      { isViewed: "1" },
      {
        where: {
          userId: userId,
          isViewed: "0",
        },
      }
    );

    // 2️⃣ Update TE notifications using Sequelize model
    // Note: TENotifications uses INTEGER so we pass numbers
    const [teUpdatedCount] = await TENotifications.update(
      { isViewed: 1 },
      {
        where: {
          userId: userId,
          isViewed: 0,
        },
      }
    );

    return systemUpdatedCount + teUpdatedCount;
  } catch (error) {
    logger.error("clearAllNotificationsService error:", error);
    throw error;
  }
};


/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Service function used to insert or update notification action (starred / viewed) for a user
 *
 * Parameters  :
 *    - params (Object) : Parameters object containing:
 *        - notificationId (Number) : Notification ID
 *        - userId (Number)         : User ID
 *        - starredAction (Number)  : Starred action (0 or 1)
 *        - viewedAction (Number)   : Viewed action (0 or 1)
 *        - flag (String)           : Field to update (starred / viewed)
 *
 * Response    : Returns a Promise<boolean> — true on successful operation
 */
export const actionDocketNotificationService = async ({
  notificationId,
  userId,
  starredAction,
  viewedAction,
  flag,
}) => {
  try {
    // Convert to strings for ENUM("0", "1") fields
    const starredStr = String(starredAction);
    const viewedStr = String(viewedAction);

    // Check if record exists
    const existing = await NotificationAction.findOne({
      where: {
        notificationId: notificationId,
        userId: userId,
      },
    });

    // INSERT
    if (!existing) {
      await NotificationAction.create({
        notificationId: notificationId,
        userId: userId,
        isStarred: starredStr,
        isViewed: viewedStr,
      });

      return true;
    }

    // 🔄 UPDATE
    const updateData = {};

    switch (flag) {
      case "starred":
        updateData.isStarred = starredStr;
        break;

      case "viewed":
        updateData.isViewed = viewedStr;
        break;

      default:
        updateData.isStarred = starredStr;
        updateData.isViewed = viewedStr;
    }

    await NotificationAction.update(updateData, {
      where: {
        notificationId: notificationId,
        userId: userId,
      },
    });

    return true;
  } catch (error) {
    logger.error("actionDocketNotificationService error:", error);
    throw error;
  }
};


/*
 * Created by  : Snehal Narkar
 * Date        : 12-02-2026
 * Description : Service function used to update TE notification action (starred / viewed) for a user
 *               NOTE: PHP always updates both is_starred and is_viewed (no flag parameter used)
 *
 * Parameters  :
 *    - params (Object) : Parameters object containing:
 *        - notificationId (Number) : TE Notification ID
 *        - userId (Number)         : User ID
 *        - starredAction (Number)  : Starred action (0 or 1)
 *        - viewedAction (Number)   : Viewed action (0 or 1)
 *
 * Response    : Returns a Promise<boolean> — true on successful operation, false if not found
 */
export const updateTENotificationActionService = async ({
  notificationId,
  userId,
  starredAction,
  viewedAction,
}) => {
  try {
    // 🔄 UPDATE - Always update both fields (matching PHP behavior)
    const [affectedRows] = await TENotifications.update(
      {
        isStarred: starredAction,
        isViewed: viewedAction,
      },
      {
        where: {
          id: notificationId,
          userId: userId,
        },
      }
    );

    // Return true if at least one row was updated
    return affectedRows > 0;
  } catch (error) {
    logger.error("updateTENotificationActionService error:", error);
    throw error;
  }
};
