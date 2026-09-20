import {
  getNotificationOnOffStatusHelper,
  getFollowedDocketsHelper,
  updateNotificationOnOffHelper,
  unfollowDocketsHelper,
  searchFollowedDocketsHelper,
} from "../../helpers/notification/notificationSettingHelper.js";
import {
  validateDocketUnfollow,
  validateSearchFollowedDocket,
} from "../../helpers/notificationSettingsValidators.js";
import { handleControllerError } from "../../helpers/errorHandler.js";

// Coerce notiStatus (boolean / 0 / 1 / '0' / '1' / 'true' / 'false') into boolean.
const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return Boolean(value);
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Function is used to fetch the notification on/off flag and the
 *               list of dockets the logged-in user is currently following.
 *
 * Parameters  :
 *    - req : Express request object (no body params required, userId from middleware)
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, data { notificationOnOff, notificationData }, error
 */
export const notiOnOffCheck = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        data: null,
        error: "User ID is required",
      });
    }

    const [notificationOnOff, followedDockets] = await Promise.all([
      getNotificationOnOffStatusHelper(userId),
      getFollowedDocketsHelper(userId),
    ]);

    return res.status(200).json({
      success: true,
      message: "Notification settings fetched successfully",
      data: {
        notificationOnOff,
        notificationData: followedDockets,
      },
      error: null,
    });
  } catch (error) {
    return handleControllerError(res, error, "Notification on/off check");
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Function is used to either turn notifications on/off for the user
 *               (when notiOnOffFlag is provided) or unfollow the supplied dockets.
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - caseIdArray (Array)    : Array of case IDs to unfollow
 *        - notiStatus (Boolean)   : Notification on/off status when toggling
 *        - notiOnOffFlag (String) : Non-empty value triggers notification on/off update
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, data and error
 */
export const docketUnfollow = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        data: null,
        error: "User ID is required",
      });
    }

    const validatedParam = validateDocketUnfollow(req.body || {});
    const { caseIdArray, notiStatus, notiOnOffFlag } = validatedParam;

    const isNotiOnOffToggle =
      notiOnOffFlag !== undefined && notiOnOffFlag !== null && notiOnOffFlag !== "";

    let result;
    if (isNotiOnOffToggle) {
      result = await updateNotificationOnOffHelper(userId, toBoolean(notiStatus));
    } else {
      result = await unfollowDocketsHelper(userId, caseIdArray);
    }

    return res.status(200).json({
      success: true,
      message: "Docket unfollow action processed successfully",
      data: result,
      error: null,
    });
  } catch (error) {
    return handleControllerError(res, error, "Docket unfollow");
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Function is used to search the dockets followed by the user by
 *               casename / casetype / caseid using a single search term.
 *
 * Parameters  :
 *    - req : Express request object containing the following parameters in body:
 *        - searchCondition (String) : Term to search across casename / casetype / caseid
 *    - res : Express response object for sending the result
 *
 * Response    : Returns JSON with success status, message, data { notificationData }, error
 */
export const searchFollowedDocket = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        data: null,
        error: "User ID is required",
      });
    }

    const { searchCondition } = validateSearchFollowedDocket(req.body || {});

    const followedDockets = await searchFollowedDocketsHelper(userId, searchCondition);

    return res.status(200).json({
      success: true,
      message: "Followed dockets fetched successfully",
      data: { notificationData: followedDockets },
      error: null,
    });
  } catch (error) {
    return handleControllerError(res, error, "Search followed docket");
  }
};
