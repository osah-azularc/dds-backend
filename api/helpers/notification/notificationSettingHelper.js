import { Op } from "sequelize";
import DocketNotifications from "../../models/DocketNotifications.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import Docket from "../../models/Docket.js";
import { logger } from "../../../config/winstonLogger.js";

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Get notification on/off status for a user
 *               Matches PHP: NotificationsModel::notiOnOffCheck()
 *
 * Parameters  :
 *    - userId (Number) : User ID
 *
 * Response    : Promise<string|false> - '0' / '1' or false when no record exists
 */
export const getNotificationOnOffStatusHelper = async (userId) => {
  try {
    const record = await JudgeAssistantClerk.findOne({
      where: { userId },
      attributes: ["notificationOnOff"],
    });

    if (!record) {
      return false;
    }

    return record.notificationOnOff;
  } catch (error) {
    logger.error("Error in getNotificationOnOffStatusHelper:", { error: error.message });
    throw error;
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Get list of dockets followed by a user
 *               Matches PHP: NotificationsModel::getFollowedDockets()
 *
 * Parameters  :
 *    - userId (Number) : User ID
 *
 * Response    : Promise<Array<{usersFollowing, caseName, caseType, caseId}>>
 */
export const getFollowedDocketsHelper = async (userId) => {
  try {
    const followed = await DocketNotifications.findAll({
      where: { userId, usersFollowing: "1" },
      attributes: ["usersFollowing", "caseId"],
      raw: true,
    });

    if (followed.length === 0) {
      return [];
    }

    const caseIds = followed.map((r) => r.caseId);
    const dockets = await Docket.findAll({
      where: { caseId: { [Op.in]: caseIds } },
      attributes: ["caseId", "caseName", "caseType"],
      raw: true,
    });

    const docketMap = new Map(dockets.map((d) => [d.caseId, d]));

    return followed.map((r) => {
      const d = docketMap.get(r.caseId);
      return {
        usersFollowing: r.usersFollowing,
        caseName: d ? d.caseName : null,
        caseType: d ? d.caseType : null,
        caseId: r.caseId,
      };
    });
  } catch (error) {
    logger.error("Error in getFollowedDocketsHelper:", { error: error.message });
    throw error;
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Update notification on/off flag on judge_assistant_clerk for a user
 *               Matches PHP: NotificationsModel::docketUnfollow() (notiOnOffFlag branch)
 *
 * Parameters  :
 *    - userId (Number)     : User ID
 *    - notiStatus (Boolean): true = on (1), false = off (0)
 *
 * Response    : Promise<{ notificationOnOff: '0' | '1' }>
 */
export const updateNotificationOnOffHelper = async (userId, notiStatus) => {
  try {
    const newStatus = notiStatus ? "1" : "0";

    // Note: Sequelize/MySQL returns affectedRows = 0 when the column value is
    await JudgeAssistantClerk.update(
      { notificationOnOff: newStatus },
      { where: { userId } }
    );

    return { notificationOnOff: newStatus };
  } catch (error) {
    logger.error("Error in updateNotificationOnOffHelper:", { error: error.message });
    throw error;
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Unfollow one or more dockets for a user
 *               Matches PHP: NotificationsModel::docketUnfollow() (default branch)
 *
 * Parameters  :
 *    - userId (Number)        : User ID
 *    - caseIdArray (Array)    : Array of case IDs to unfollow
 *
 * Response    : Promise<{ docketUnfollowed: '0' | '1' | '2' }>
 *               '2' when caseIdArray is empty, '1' on success, '0' on failure
 */
export const unfollowDocketsHelper = async (userId, caseIdArray) => {
  try {
    if (!Array.isArray(caseIdArray) || caseIdArray.length === 0) {
      return { docketUnfollowed: "2" };
    }

    const [affectedRows] = await DocketNotifications.update(
      { usersFollowing: "0", updatedDate: new Date() },
      {
        where: {
          caseId: { [Op.in]: caseIdArray },
          userId,
        },
      }
    );

    return { docketUnfollowed: affectedRows > 0 ? "1" : "0" };
  } catch (error) {
    logger.error("Error in unfollowDocketsHelper:", { error: error.message });
    throw error;
  }
};

/*
 * Created by  : Snehal Narkar
 * Date        : 04-05-2026
 * Description : Search followed dockets for a user by casename / casetype / caseid
 *               Matches PHP: NotificationsModel::searchFollowedDocket()
 *
 * Parameters  :
 *    - userId (Number)         : User ID
 *    - searchCondition (String): Search term
 *
 * Response    : Promise<Array<{usersFollowing, caseName, caseType, caseId}>>
 */
export const searchFollowedDocketsHelper = async (userId, searchCondition) => {
  try {
    const followed = await DocketNotifications.findAll({
      where: { userId, usersFollowing: "1" },
      attributes: ["usersFollowing", "caseId"],
      raw: true,
    });

    if (followed.length === 0) {
      return [];
    }

    const caseIds = followed.map((r) => r.caseId);
    const term = `%${searchCondition}%`;

    const dockets = await Docket.findAll({
      where: {
        caseId: { [Op.in]: caseIds },
        [Op.or]: [
          { caseName: { [Op.like]: term } },
          { caseType: { [Op.like]: term } },
          { caseId: { [Op.like]: term } },
        ],
      },
      attributes: ["caseId", "caseName", "caseType"],
      raw: true,
    });

    const followingMap = new Map(followed.map((r) => [r.caseId, r.usersFollowing]));

    return dockets.map((d) => ({
      usersFollowing: followingMap.get(d.caseId) || "1",
      caseName: d.caseName,
      caseType: d.caseType,
      caseId: d.caseId,
    }));
  } catch (error) {
    logger.error("Error in searchFollowedDocketsHelper:", { error: error.message });
    throw error;
  }
};
