import crypto from "node:crypto";
import { runDays91Cron } from "../cron/days91Cron.js";
import { logger } from "../../config/winstonLogger.js";

/**
 * Manual cron-trigger endpoints — lets clerk/IT re-run a scheduled job on demand (e.g. after
 * fixing a failure) instead of waiting for its next scheduled time. Not tied to any one
 * feature's business logic, so this lives in its own controller/route rather than piggybacking
 * on the route file for whichever feature happens to own the cron.
 */
const runCronManually = async (req, res, cronName, cronTask) => {
  try {
    logger.info(`[ManualCron] ${cronName} triggered by user ${req.userId}`);
    const result = await cronTask();

    return res.status(200).json({
      success: true,
      message: `${cronName} completed successfully.`,
      data: result ?? null,
      error: null,
    });
  } catch (error) {
    const referenceId = crypto.randomUUID();
    logger.error(
      `[ManualCron] ${cronName} failed [ref: ${referenceId}]:`,
      error,
    );
    return res.status(500).json({
      success: false,
      message: `${cronName} failed.`,
      data: null,
      error: `Reference ID: ${referenceId}`,
    });
  }
};

// DDS 91-day processing (see days91Cron.js). Safe to re-run on demand; idempotent - a case
// already marked telv_o_five = '1' is never matched or updated again.
export const triggerDays91Cron = async (req, res) => (
  runCronManually(req, res, 'DDS 91-day cron', runDays91Cron)
);
