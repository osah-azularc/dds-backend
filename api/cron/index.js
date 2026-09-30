import cron from "node-cron";
import { runDays91Cron } from "./days91Cron.js";
import { logger } from "../../config/winstonLogger.js";

// Retry function every 10 minutes for 3 times
const retry = async (fn, retries = 3, delay = 600000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await fn();
      return;
    } catch (error) {
      logger.error(`Attempt ${i + 1} failed: ${error.message}`);
      if (i < retries - 1) {
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  logger.error("All retry attempts failed.");
};

export const crons = () => {
  // At 04:01 AM every day — DDS 91-day processing (mirrors PHP DdsForm1Controller::days91Action,
  // which legacy's crontab hit via `wget .../dds-form1/days91` at "1 4 * * *"). Same minute as
  // ecourt's bulkExportDocCron is fine: that job reads `docket`, which these Form 1s only reach
  // after a clerk approves them, so neither job depends on the other's output.
  const days91Task = cron.schedule("1 4 * * *", () => {
    logger.info("Running runDays91Cron at 04:01 AM daily.");
    retry(runDays91Cron).catch((error) => logger.error(error));
  });

  const tasks = [days91Task];

  return () => tasks.forEach((task) => task.stop());
};
