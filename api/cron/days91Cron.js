/**
 * Created by  : Snehal Narkar
 * Date        : 25-09-2026
 * Description : DDS 91-Day Cron — runs at 04:01 AM daily (1 4 * * *).
 * Mirrors legacy DdsForm1Controller::days91Action() (crontab: `wget .../dds-form1/days91`).
 *
 * For ALS Form 1s with telv_o_five = '0', no Date Received, created 91+ days ago:
 *   - form1_docket: datereceivedbyOSAH = today, hearingmode = 'Desk Review',
 *     county = 'No County', status = 'submitted', telv_o_five = '1'
 *   - form1_dds_1205_offence: county_of_occurences = 'No County'
 * Judge/hearing fields are not set (commented out in legacy too).
 *
 * Idempotent: the UPDATE re-checks telv_o_five = '0', so a case is never processed twice.
 * Each case runs in its own transaction; one failure is logged and the rest continue.
 */
import { Op, fn, col, literal, where as sqlWhere } from "sequelize";
import { logger } from "../../config/winstonLogger.js";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { localNow } from "../helpers/timeUtils.js";
import Form1Docket from "../models/Form1Docket.js";
import Form1Dds1205Offence from "../models/Form1Dds1205Offence.js";

const NO_COUNTY = "No County";

export const runDays91Cron = async () => {
  logger.info("[Days91Cron] Starting DDS 91-day processing");

  const today = localNow().format("YYYY-MM-DD");
  // UTC midnight so Sequelize's UTC conversion can't shift Date Received to the previous day.
  const todayForDb = new Date(`${today}T00:00:00Z`);

  const cases = await Form1Docket.findAll({
    attributes: ["form1Id"],
    where: {
      telvOFive: "0",
      caseType: "ALS",
      dateReceivedByOSAH: null,
      // Same comparison as legacy: DATE(docket_createddate) <= DATE_SUB(NOW(), INTERVAL 91 DAY).
      [Op.and]: [
        sqlWhere(fn("DATE", col("docket_createddate")), { [Op.lte]: literal("DATE_SUB(NOW(), INTERVAL 91 DAY)") }),
      ],
    },
    order: [["form1Id", "DESC"]],
    raw: true,
  });

  logger.info(`[Days91Cron] ${cases.length} case(s) qualify (created 91+ days ago)`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { form1Id } of cases) {
    try {
      const updated = await mysqlSequelize.transaction(async (transaction) => {
        const [count] = await Form1Docket.update(
          {
            dateReceivedByOSAH: todayForDb,
            hearingMode: "Desk Review",
            county: NO_COUNTY,
            status: "submitted",
            telvOFive: "1",
          },
          { where: { form1Id, telvOFive: "0" }, transaction },
        );
        if (count === 0) return false;

        await Form1Dds1205Offence.update(
          { countyOfOccurences: NO_COUNTY },
          { where: { form1Id }, transaction },
        );
        return true;
      });

      if (updated) {
        processed++;
        logger.info(`[Days91Cron] Processed form1_id ${form1Id}`);
      } else {
        skipped++;
        logger.info(`[Days91Cron] Skipped form1_id ${form1Id} — already processed`);
      }
    } catch (error) {
      failed++;
      logger.error(`[Days91Cron] Failed form1_id ${form1Id}: ${error.message}`);
    }
  }

  logger.info(`[Days91Cron] Done — processed: ${processed}, skipped: ${skipped}, failed: ${failed}`);
  return { processed, skipped, failed };
};
