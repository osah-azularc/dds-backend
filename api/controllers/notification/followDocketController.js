import {
  getFollowDocketStatusHelper,
  followDocketNotificationHelper,
  unfollowDocketPreviousJudgeSaHelper,
} from "../../helpers/notification/followDocketHelper.js";
import {
  validateFollowDocketNoti,
  validateFollowDocketStatusNoti,
  validateUnfollowDocketPreviousJudgeSa,
} from "../../helpers/notificationValidators.js";
import { logger } from "../../../config/winstonLogger.js";


/*
 * Created by  : Snehal Narkar
 * Date        : 10-03-2026
 * Description : Follow/Unfollow a docket for notifications
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - docket (String) : Docket/Case ID
 *        - follow_action (String) : '0' = unfollow, '1' = follow
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, boolean data, and error
 */
export const followDocketNotification = async (req, res) => {
  try {
    // Validate payload via Joi schema
    const { docket, follow_action } = validateFollowDocketNoti(req.body);
    const userId = req.userId; // From getLoggedInUserId middleware

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required", data: null, error: "User ID is required" });
    }

    const result = await followDocketNotificationHelper({
      caseId: docket,
      userId,
      followAction: follow_action
    });

    return res.status(200).json({
      success: true,
      message: result ? "Docket follow status updated successfully" : "Failed to update follow status",
      data: result,
      error: null,
    });
  } catch (error) {
    logger.error("followDocketNotification error:", error);
    if (error.name === "ValidationError" || error.isValidationError) {
      return res.status(400).json({ success: false, message: "Validation error", data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", data: null, error: "followDocketNotification failed" });
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 10-03-2026
 * Description : Get follow docket notification status for a user
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - docket (String) : Docket/Case ID
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, boolean data, and error
 */
export const getFollowDocketStatus = async (req, res) => {
  try {
    // Validate payload via Joi schema
    const { docket } = validateFollowDocketStatusNoti(req.body);
    const userId = req.userId; // From getLoggedInUserId middleware

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required", data: null, error: "User ID is required" });
    }

    const { followStatus } = await getFollowDocketStatusHelper({
      caseId: docket,
      userId
    });

    // Return the follow status value (can be '0', '1', or null)
    return res.status(200).json({
      success: true,
      message: "Follow status retrieved successfully",
      data: followStatus,
      error: null,
    });
  } catch (error) {
    logger.error("getFollowDocketStatus error:", error);
    if (error.name === "ValidationError" || error.isValidationError) {
      return res.status(400).json({ success: false, message: "Validation error", data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", data: null, error: "getFollowDocketStatus failed" });
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 15-05-2026
 * Description : Unfollow the previous judge/staff attorney when assignments change
 * Matches legacy PHP NotificationsController::unfollowDocketPreviousJudgeSaAction
 */
export const unfollowDocketPreviousJudgeSa = async (req, res) => {
  try {
    const {
      docket,
      previousJudge,
      previousStaffattorney,
      newJudge,
      newStaffattorney,
    } = validateUnfollowDocketPreviousJudgeSa(req.body);

    const result = await unfollowDocketPreviousJudgeSaHelper({
      caseId: docket,
      previousJudge,
      previousStaffattorney,
      newJudge,
      newStaffattorney,
    });

    return res.status(200).json({
      success: true,
      message: result
        ? 'Previous judge/staff attorney docket follow status updated successfully'
        : 'No previous judge/staff attorney follow records required updating',
      data: {
        notification_data: result,
      },
      error: null,
    });
  } catch (error) {
    logger.error('unfollowDocketPreviousJudgeSa error:', error);
    if (error.name === 'ValidationError' || error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: error.message });
    }
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: 'unfollowDocketPreviousJudgeSa failed' });
  }
};