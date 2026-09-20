import { Op, col, fn, where } from 'sequelize';
import DocketNotifications from "../../models/DocketNotifications.js";
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import Docket from '../../models/Docket.js';
import NotificationCaseTypesRestriction from '../../models/NotificationCaseTypesRestriction.js';
import { logger } from "../../../config/winstonLogger.js";

const normalizeAssignedUserName = (value) => String(value ?? '').trim();

const resolveJudgeSaUserId = async (displayName) => {
  const normalizedDisplayName = normalizeAssignedUserName(displayName);
  if (!normalizedDisplayName) return null;

  const user = await JudgeAssistantClerk.findOne({
    where: {
      userType: { [Op.in]: ['judge', 'sa'] },
      [Op.and]: [
        where(fn('CONCAT', col('LastName'), ' ', col('FirstName')), normalizedDisplayName),
      ],
    },
    attributes: ['userId'],
    raw: true,
  });

  return user?.userId ?? null;
};

/**
 * "Applicable case types" gate for judge/staff-attorney auto-follow, reusing the
 * same notification_case_types_restriction table that already gates outbound
 * eFiling/quick-action emails elsewhere (efilingNotificationService.checkNotificationRestriction,
 * quickActionEmailShared.isNotificationRestricted). A case type listed there is treated
 * as NOT applicable for auto-follow. Fails open (applicable) when agency/case type are
 * unknown so a data gap never silently blocks the "Assigned Judge/SA auto-follows" rule.
 */
const isApplicableCaseType = async (agencyCode, caseType) => {
  if (!agencyCode || !caseType) return true;
  const restriction = await NotificationCaseTypesRestriction.findOne({
    where: { agency: agencyCode, caseType },
    attributes: ['id'],
  });
  return restriction === null;
};

/**
 * Auto-follow the docket for its assigned Judge and/or Staff Attorney.
 * Matches product rule: "Assigned Judge / Assigned Staff Attorney automatically
 * follows the docket for applicable case types" — unlike CMA/JA/other internal
 * users, they never click "Notify Me" themselves.
 *
 * Non-fatal by design: called from docket create/reassignment flows and must
 * never block those on a follow-seeding failure.
 *
 * @param {Object} params
 * @param {string|number} params.caseId
 * @param {string} params.agencyCode - docket.refAgency, for the case-type gate
 * @param {string} params.caseType   - docket.caseType, for the case-type gate
 * @param {string} [params.judge]         - display name ("Lastname Firstname"); '' to skip
 * @param {string} [params.staffAttorney] - display name ("Lastname Firstname"); '' to skip
 * @returns {Promise<boolean>} true if at least one follow row was created/updated
 */
export const followAssignedJudgeAndStaffAttorneyHelper = async ({
  caseId,
  agencyCode,
  caseType,
  judge,
  staffAttorney,
}) => {
  try {
    if (!(await isApplicableCaseType(agencyCode, caseType))) {
      return false;
    }

    const assigneeNames = [normalizeAssignedUserName(judge), normalizeAssignedUserName(staffAttorney)]
      .filter(Boolean);
    if (assigneeNames.length === 0) return false;

    const userIds = (await Promise.all(assigneeNames.map(resolveJudgeSaUserId)))
      .filter((userId) => userId !== null && userId !== undefined);
    if (userIds.length === 0) return false;

    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        followDocketNotificationHelper({ caseId, userId, followAction: '1' })),
    );

    return true;
  } catch (error) {
    logger.error('Error in followAssignedJudgeAndStaffAttorneyHelper:', {
      error: error.message,
      caseId,
    });
    return false;
  }
};

/**
 * Follow/Unfollow a docket for notifications
 * Matches PHP: followDocketNotifications() in NotificationsModel
 * 
 * @param {Object} params - Parameters object
 * @param {String} params.caseId - Docket/Case ID
 * @param {Number} params.userId - User ID
 * @param {String} params.followAction - '0' = unfollow, '1' = follow
 * @returns {Promise<Boolean>} - true if successful, false otherwise
 * 
 * @description
 * Creates or updates a docket notification record for a user.
 * If record doesn't exist, creates new one with follow_action.
 * If record exists, updates the users_following field.
 */
export const followDocketNotificationHelper = async ({ caseId, userId, followAction }) => {
  try {
	    // Check if record already exists
	    const existingRecord = await DocketNotifications.findOne({
	      where: {
	        caseId: caseId,
	        userId: userId,
	      },
	    });

	    if (existingRecord) {
	      // UPDATE existing record
	      await DocketNotifications.update(
	        {
	          usersFollowing: followAction,
	          updatedDate: new Date(),
	        },
	        {
	          where: {
	            caseId: caseId,
	            userId: userId,
	          },
	        },
	      );

	      return true;
	    }

	    // INSERT new record
	    await DocketNotifications.create({
	      caseId: caseId,
	      userId: userId,
	      usersFollowing: followAction,
	    });

	    return true;
  } catch (error) {
    logger.error("Error in followDocketNotificationHelper:", {
      error: error.message
    });
    throw error;
  }
};

/**
 * Get follow docket notification status
 * Matches PHP: followDocStatusNoti() in NotificationsModel
 * 
 * @param {Object} params - Parameters object
 * @param {String} params.caseId - Docket/Case ID
 * @param {Number} params.userId - User ID
 * @returns {Promise<{followStatus: string|null}>} - { followStatus: '0' | '1' | null }
 * 
 * @description
 * Checks if a user is following a specific docket for notifications.
 * Returns '1' if following, '0' if unfollowed, null if never set.
 */
export const getFollowDocketStatusHelper = async ({ caseId, userId }) => {
  try {
    const notification = await DocketNotifications.findOne({
      where: {
        caseId: caseId,
        userId: userId,
      },
      attributes: ['usersFollowing'],
    });

    // Return the actual value: '0', '1', or null (matching PHP behavior)
    const followStatus = notification ? notification.usersFollowing : null;

    return { followStatus };
  } catch (error) {
    logger.error("Error in getFollowDocketStatusHelper:", {
      error: error.message,
    });
    throw error;
  }
};

/**
 * Unfollow the previously assigned judge and/or staff attorney when docket
 * assignments change.
 * Matches PHP: unfollowDocketPreviousJudgeSa() in NotificationsModel.
 *
 * @param {Object} params
 * @param {string|number} params.caseId
 * @param {string} params.previousJudge
 * @param {string} params.previousStaffattorney
 * @param {string} params.newJudge
 * @param {string} params.newStaffattorney
 * @returns {Promise<boolean>} true if any rows were updated, else false
 */
export const unfollowDocketPreviousJudgeSaHelper = async ({
  caseId,
  previousJudge,
  previousStaffattorney,
  newJudge,
  newStaffattorney,
}) => {
  try {
    const normalizedPreviousJudge = normalizeAssignedUserName(previousJudge);
    const normalizedPreviousStaffattorney = normalizeAssignedUserName(previousStaffattorney);
    const normalizedNewJudge = normalizeAssignedUserName(newJudge);
    const normalizedNewStaffattorney = normalizeAssignedUserName(newStaffattorney);

    const userIdsToUnfollow = [];

    if (normalizedPreviousJudge && normalizedPreviousJudge !== normalizedNewJudge) {
      const previousJudgeUserId = await resolveJudgeSaUserId(normalizedPreviousJudge);
      if (previousJudgeUserId) userIdsToUnfollow.push(previousJudgeUserId);
    }

    if (normalizedPreviousStaffattorney && normalizedPreviousStaffattorney !== normalizedNewStaffattorney) {
      const previousStaffattorneyUserId = await resolveJudgeSaUserId(normalizedPreviousStaffattorney);
      if (previousStaffattorneyUserId) userIdsToUnfollow.push(previousStaffattorneyUserId);
    }

    let updatedCount = 0;
    if (userIdsToUnfollow.length > 0) {
      [updatedCount] = await DocketNotifications.update(
        {
          usersFollowing: '0',
          updatedDate: new Date(),
        },
        {
          where: {
            caseId,
            userId: { [Op.in]: [...new Set(userIdsToUnfollow)] },
          },
        },
      );
    }

    // Auto-follow whoever is newly assigned — matches product rule: "Assigned
    // Judge / Assigned Staff Attorney automatically follows the docket for
    // applicable case types". Only the assignments that actually changed are
    // passed through, so an unchanged judge/SA is left alone (no redundant write).
    // This is the single server-side hook for reassignment-follow: the frontend
    // already calls this endpoint after every docket save with old + new names,
    // so no separate frontend change is needed to auto-follow on update.
    const docket = await Docket.findOne({
      where: { caseId },
      attributes: ['refAgency', 'caseType'],
      raw: true,
    });
    await followAssignedJudgeAndStaffAttorneyHelper({
      caseId,
      agencyCode: docket?.refAgency,
      caseType: docket?.caseType,
      judge: normalizedNewJudge !== normalizedPreviousJudge ? normalizedNewJudge : '',
      staffAttorney: normalizedNewStaffattorney !== normalizedPreviousStaffattorney ? normalizedNewStaffattorney : '',
    });

    return updatedCount > 0;
  } catch (error) {
    logger.error('Error in unfollowDocketPreviousJudgeSaHelper:', {
      error: error.message,
      caseId,
    });
    throw error;
  }
};

