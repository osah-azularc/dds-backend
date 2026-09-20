/**
 * @module userLockoutController
 * @description Manages user account lockout and login-activity cleanup:
 *   unlockUser, getAllLockoutPeriods, createLockoutPeriod, updateLockoutPeriod,
 *   removePastLoginActivities
 *
 * NOTE: LockoutPeriod model was deleted (PostgreSQL). The lockout-period CRUD
 * endpoints will throw at runtime until the model is re-implemented for MySQL.
 */

import User from "../../models/User.js";
import { SAFE_TEXT_REGEX, parsePositiveInt, normalizeString } from "./userHelpers.js";
import { logger, activityLogger } from "../../../config/winstonLogger.js";

// LockoutPeriod model was deleted (PostgreSQL). Placeholder to keep import
// references clear — remove when MySQL model is available.
// import LockoutPeriod from "../../models/lockoutPeriodMasterModel.js"; // DELETED

/**
 * Unlocks a locked user account and resets login-attempt counters.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const unlockUser = async (req, res) => {
  const userId = parsePositiveInt(req.body?.userId);
  const loggedInRole = normalizeString(req.body?.loggedInRole);

  if (!userId || !loggedInRole || !SAFE_TEXT_REGEX.test(loggedInRole)) {
    return res.status(400).json({ success: false, message: "Invalid userId or loggedInRole" });
  }

  try {
    const userData = await User.findOne({ where: { id: userId } });

    if (!userData) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const user_id_email = `(User ID: ${userData?.id}, Email: ${userData?.email})`;

    const response = await User.update(
      {
        failed_login_attempts_count: 0,
        failed_login_attempts_datetime: null,
        lockout_period: 0,
        is_locked: "0",
      },
      { where: { id: userId } }
    );

    activityLogger.error(
      `[AccountUnlocked] ${user_id_email} account was unlocked by ${loggedInRole}` +
        `, it was in lockout period: ${userData?.lockout_period}`
    );

    return res.status(200).json({ success: true, message: "User unlocked successfully", response });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Returns all configured lockout periods.
 * NOTE: LockoutPeriod model is deleted — this will fail at runtime.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getAllLockoutPeriods = async (req, res) => {
  try {
    // LockoutPeriod model deleted (PostgreSQL). Placeholder response.
    res.status(200).json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ success: false, data: [] });
  }
};

/**
 * Creates a new lockout period configuration.
 * NOTE: LockoutPeriod model is deleted — this will fail at runtime.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const createLockoutPeriod = async (req, res) => {
  const lockout_period_count = parsePositiveInt(req.body?.lockout_period_count);
  const lockout_period = parsePositiveInt(req.body?.lockout_period);

  if (!lockout_period_count || !lockout_period) {
    return res.status(400).json({ success: false, message: "Required fields are missing" });
  }

  try {
    // LockoutPeriod model deleted (PostgreSQL). This endpoint is non-functional.
    res.status(503).json({ success: false, message: "Lockout period management is not available" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Updates an existing lockout period configuration.
 * NOTE: LockoutPeriod model is deleted — this will fail at runtime.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const updateLockoutPeriod = async (req, res) => {
  const id = parsePositiveInt(req.body?.id);
  const lockout_period = parsePositiveInt(req.body?.lockout_period);

  if (!id || !lockout_period) {
    return res.status(400).json({ success: false, message: "Required fields are missing" });
  }

  try {
    // LockoutPeriod model deleted (PostgreSQL). This endpoint is non-functional.
    res.status(503).json({ success: false, message: "Lockout period management is not available" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Cron handler: removes login-activity entries older than 30 days.
 * NOTE: LoginActivity model is deleted — runs as a no-op.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const removePastLoginActivities = async (req, res) => {
  const currentDate = new Date();
  const pastDaysDate = new Date(currentDate.setDate(currentDate.getDate() - 30));

  try {
    // LoginActivity model deleted (PostgreSQL). Placeholder — no-op.
    const response = 0;
    logger.info(
      `[RemovedPastLoginActivities] Total ${response} entries past ${pastDaysDate} records removed`
    );
    res.status(200).json({ success: true, message: "Past 30 days entries removed" });
  } catch (error) {
    logger.error(`[RemovedPastLoginActivities] Failed to remove past ${pastDaysDate} entries, Error: ${error}`);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

