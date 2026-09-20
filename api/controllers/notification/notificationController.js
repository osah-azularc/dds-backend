import {
  getSystemNotifications,
  getTENotifications,
} from "../../helpers/notification/notificationHelper.js";
import {
  clearAllNotificationsService,
  actionDocketNotificationService,
  updateTENotificationActionService
} from "../../helpers/notification/notificationDocketHelper.js";
import downloadNotificationDocument from "../../helpers/notification/downloadDocumentHelper.js";
import { getAlternativeStorageSignedDownloadUrl } from "../../../helpers/s3.js";
import {
  validateGetUnreadNotiData,
  validateActionDocketNoti,
  validateUpdateTE,
} from "../../helpers/notificationValidators.js";
import { sendSuccess, sendError } from "../../helpers/responseHelpers.js";
import { handleControllerError } from "../../helpers/errorHandler.js";
import { logger } from "../../../config/winstonLogger.js";


/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Function is used to fetch notifications based on notification type (unread / viewed / starred / all)
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - notificationLimit (Array)  : Limit for notifications
 *        - notification_type (String) : Type of notification (unread / viewed / starred / all)
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, data array, and error
 */
export const getUnreadNotiData = async (req, res) => {
  try {
    const userId = req.userId;
    const param = req.body || {};

    if (!userId) {
      return sendError(res, "User ID is required", "User ID is required", 400);
    }

    // Validate payload and let defaults mirror legacy PHP behavior.
    // An empty body should behave like PHP defaults, not return an empty list.
    const validatedParam = validateGetUnreadNotiData(param);

    // Extract parameters with defaults matching PHP
    const notificationLimit = validatedParam.notificationLimit || "";
    const notificationType = validatedParam.notificationType || "unread";

    const systemData = await getSystemNotifications(
      userId,
      notificationLimit,
      notificationType
    );

    // Always get TE unread count as part of the shared unread badge total.
    // TE notifications do not support a starred tab, so for starred requests we
    // fetch TE metadata only to preserve the correct global unread count.
    const teData = await getTENotifications(
      userId,
      notificationType === "starred" ? 0 : notificationLimit,
      notificationType === "starred" ? "te" : notificationType
    );

	    let responseData;

	    // PHP doesn't support "starred" filter for TE notifications
	    if (notificationType === "starred") {
	      // For "starred", now returning both system notifications (TE notifications as well fixed existing issue)
	      responseData = {
	        returnDate: systemData.returnDate,
	        resultDataCount: systemData.resultDataCount + teData.TEUnReadNotiCount,
	        currentNotiCount: systemData.currentNotiCount,
	      };
	    } else {
	      // Merge and sort by created_date DESC (matching PHP ORDER BY)
	      const mergedNotifications = [
	        ...systemData.returnDate,
	        ...teData.returnDate,
	      ].sort((a, b) => {
	        // Handle both Date objects and string dates
	        const dateA = new Date(a.createdDate);
	        const dateB = new Date(b.createdDate);
	        return dateB - dateA; // DESC order
	      });

	      responseData = {
	        returnDate: mergedNotifications,
	        resultDataCount:
	          systemData.resultDataCount + teData.TEUnReadNotiCount,
	        currentNotiCount:
	          systemData.currentNotiCount + teData.currentNotiCount,
	      };
	    }

	    return sendSuccess(res, "Notifications fetched successfully", responseData);
  } catch (err) {
    logger.error("getUnreadNotiData error:", err);

    // Handle validation errors with standard format
    return handleControllerError(res, err, "Failed to fetch notifications");
  }
};

const isAlternativeStoragePath = (filePath) => /^\/?eCourt-(Dev|Stg|Uat|Prod)\//i.test(String(filePath || '').trim());

/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Function is used to mark all unread notifications as viewed for the current user
 *
 * Parameters  :
 *    - req : Express request object
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status and count of updated notifications
 */
export const clearAllNotiAction = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return sendError(res, "User ID is required", "User ID is required", 400);
    }

    const result = await clearAllNotificationsService(userId);
    const message = result > 0
      ? "All notifications marked as viewed successfully"
      : "No unread notifications found";

    return sendSuccess(res, message, result);
  } catch (error) {
    logger.error("clearAllNotiAction error:", error);
    return handleControllerError(res, error, "Clear all notification failed");
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Function is used to handle starring and viewing actions on notifications
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - notificationId (Number) : Notification ID
 *        - starredAction (Number)  : Starred action (0 or 1)
 *        - viewedAction (Number)   : Viewed action (0 or 1)
 *        - flag (String)            : Field to update (starred / viewed)
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status and boolean data indicating operation result
 */
export const actionDocketNotiAction = async (req, res) => {
  try {
    const userId = req.userId;
    const param = req.body;
    
    if (!userId) {
      return sendError(res, "User ID is required", "User ID is required", 400);
    }

    // Validate payload
    const validatedParam = validateActionDocketNoti(param);

    const {
      notificationId,
      starredAction,
      viewedAction,
      flag,
    } = validatedParam;


    const result = await actionDocketNotificationService({
      notificationId,
      userId,
      starredAction,
      viewedAction,
      flag,
    });

    return sendSuccess(
      res,
      "Notification action updated successfully",
      result
    );
  } catch (error) {
    logger.error("actionDocketNotiAction error:", error);

    // Handle validation errors with standard format
    return handleControllerError(res, error, "Notification action");
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Function is used to handle starring and viewing actions on TE (Time Entry) notifications
 *               NOTE: PHP always updates both is_starred and is_viewed (no flag parameter used)
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - notificationId (Number) : TE Notification ID
 *        - starredAction (Number)  : Starred action (0 or 1)
 *        - viewedAction (Number)   : Viewed action (0 or 1)
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status and boolean data indicating operation result
 */
export const updateTEAction = async (req, res) => {
  try {
    const userId = req.userId;
    const param = req.body;

    if (!userId) {
      return sendError(res, "User ID is required", "User ID is required", 400);
    }

    // Validate payload
    const validatedParam = validateUpdateTE(param);

    const {
      notificationId,
      starredAction,
      viewedAction,
    } = validatedParam;


    const result = await updateTENotificationActionService({
      notificationId,
      userId,
      starredAction,
      viewedAction,
    });

    return sendSuccess(
      res,
      "TE notification action updated successfully",
      result
    );
  } catch (error) {
    logger.error("updateTEAction error:", error);

    // Handle validation errors with standard format
    return handleControllerError(res, error, "TE notification action");
  }
};

/*
 * Description : Download notification attachment using the same fallback order as Angular/PHP
 *               1) Osahform/downloaddocument equivalent (attachmentpaths)
 *               2) efiling/is-file-exists equivalent (external_documents)
 */
export const downloadNotificationAttachmentAction = async (req, res) => {
  try {
    const documentId = req.body?.docId;

    if (!documentId) {
      return res.status(400).json({
        status: 400,
        success: false,
        data: '0',
        message: 'Document ID is required',
      });
    }

    const filePath = await downloadNotificationDocument(documentId);

    if (filePath === '0') {
      return res.status(200).json({
        status: 200,
        success: false,
        data: '0',
        message: 'File not found',
      });
    }

    const responsePath = isAlternativeStoragePath(filePath)
      ? await getAlternativeStorageSignedDownloadUrl(filePath)
      : filePath;

    return res.status(200).json({
      status: 200,
      success: true,
      data: responsePath,
      message: 'File found',
    });
  } catch (error) {
    return sendError(
      res,
      'Failed to download notification attachment',
      error.message || 'Download failed',
      500,
    );
  }
};
