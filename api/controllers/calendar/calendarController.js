import { Op, Sequelize } from "sequelize";
import Docket from "../../models/Docket.js";
import CourtLocations from "../../models/CourtLocations.js";
import HearingTime from "../../models/calendar/HearingTimeModel.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import V2_5_Calendar_Hearing_Info from "../../models/admin/v2_5_calendar_hearing_infoModel.js";
import V2_5_Calendar from "../../models/admin/v2_5_calendarModel.js";
import CasteTypeGroups from "../../models/admin/casteTypeGroupsModel.js";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Get upcoming calendar hearings, grouped by hearing date / judge / hearing site,
 * with the casetype group(s) for each group resolved through
 * v2_5_calendar_hearing_info -> v2_5_calendar -> casetypegroups.
 *
 * Converted from the legacy PHP getUpcomingCalendarData action. The original ran
 * one SQL query with 4 INNER JOINs per hearing-date group, then a further query
 * per matched docket row; here the lookup tables (courtlocations, hearingtime,
 * judge_assistant_clerk, v2_5_calendar, casetypegroups) are preloaded once via
 * their Sequelize models and joined in memory instead of re-querying per row.
 *
 * @param {Object} req - Express request object
 * @param {Object} req.body.condition - Filter conditions
 * @param {string} [req.body.condition.judge] - Judge name filter (used when searchFlage == 1)
 * @param {string} [req.body.condition.hrdate_from] - Hearing date range start (used when searchFlage == 1)
 * @param {string} [req.body.condition.hrdate_to] - Hearing date range end (used when searchFlage == 1)
 * @param {number} [req.body.searchFlage] - 1 = explicit search (judge/date filters apply);
 *   otherwise the logged-in judge assistant's own calendar is returned
 * @param {Object} res - Express response object
 */
export const getUpcomingCalendarData = async (req, res) => {
  try {
    const { condition = {}, searchFlage } = req.body;
    const { judge = "", hrdate_from: hearingDateFrom, hrdate_to: hearingDateTo } = condition;

    const where = {
      status: { [Op.ne]: "Closed" },
      telvOFive: "1",
      // Some legacy dockets have hearingdate stored as MySQL's zero-date
      // placeholder ('0000-00-00'). Step 3 below reuses each group's raw
      // hearingdate value as a WHERE parameter on a follow-up query, and the
      // current sql_mode (NO_ZERO_DATE) rejects '0000-00-00' as a DATE literal
      // outright — even Sequelize.literal('0000-00-00') triggers ER_WRONG_VALUE,
      // so it can't be excluded by equality. Filtering with a real, valid lower
      // bound instead sidesteps that: MySQL never needs to parse the bad value
      // as a literal, it just compares stored dates against a legitimate one.
      hearingDate: { [Op.gte]: "1000-01-01" },
    };

    // Legacy PHP's "today" floor: applied whenever the caller didn't pin down an
    // explicit lower bound themselves, since this endpoint is only ever meant to
    // return *upcoming* hearings.
    const todayDate = new Date().toISOString().slice(0, 10);

    if (Number(searchFlage) === 1) {
      if (judge) {
        where.judge = judge;
      }
      // No explicit "from" date was given - default the floor to today instead of
      // leaving it at the zero-date guard above, otherwise a judge-only search
      // (no date range) would return that judge's entire past history too.
      where.hearingDate[Op.gte] = hearingDateFrom || todayDate;
      if (hearingDateTo) where.hearingDate[Op.lte] = hearingDateTo;
    } else {
      // Non-search view: scope to the logged-in judge assistant's own calendar.
      // Resolved from the authenticated user (req.userId) rather than trusting a
      // client-supplied username, since docket.judgeassistant is matched by name.
      const currentUser = await JudgeAssistantClerk.findOne({
        where: { userId: req.userId },
        attributes: ["firstName", "lastName"],
        raw: true,
      });

      if (!currentUser) {
        return res.status(200).json({
          status: 200,
          message: "Upcoming calendar data fetched successfully",
          data: [],
          success: true,
        });
      }

      where.judgeAssistant = `${currentUser.lastName} ${currentUser.firstName}`;
      where.hearingDate[Op.gte] = todayDate;
    }

    // Step 1: hearing-date groups (mirrors the legacy
    // SELECT ... GROUP BY hearingdate, judge, hearingsite).
    const mainRows = await Docket.findAll({
      attributes: [
        [Sequelize.col("hearingdate"), "hearingDateRaw"],
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("hearingdate"), "%m-%d-%Y"), "hearingDate"],
        [Sequelize.col("judge"), "judge"],
        [Sequelize.col("hearingsite"), "courtLocation"],
        [Sequelize.fn("COUNT", Sequelize.col("hearingdate")), "noOfCases"],
      ],
      where,
      group: ["hearingdate", "judge", "hearingsite"],
      raw: true,
    });

    if (mainRows.length === 0) {
      return res.status(200).json({
        status: 200,
        message: "Upcoming calendar data fetched successfully",
        data: [],
        success: true,
      });
    }

    // Step 2: preload the lookup tables used by the legacy INNER JOINs once,
    // instead of re-querying them for every docket row.
    const [courtLocations, hearingTimes, allJudgeAssistants, allCalendars, allCasetypeGroups] =
      await Promise.all([
        CourtLocations.findAll({ attributes: ["courtLocationId", "locationName"], raw: true }),
        HearingTime.findAll({ attributes: ["timeId", "hearingTimeStored"], raw: true }),
        JudgeAssistantClerk.findAll({ attributes: ["userId", "firstName", "lastName"], raw: true }),
        V2_5_Calendar.findAll({ attributes: ["id", "caseTypeGroupId"], raw: true }),
        CasteTypeGroups.findAll({ attributes: ["id", "casetypegroup"], raw: true }),
      ]);

    const courtLocationIdByName = new Map(
      courtLocations.map((loc) => [loc.locationName, loc.courtLocationId]),
    );
    const timeIdByStoredTime = new Map(
      hearingTimes.map((time) => [time.hearingTimeStored, time.timeId]),
    );
    const userIdByFullName = new Map(
      allJudgeAssistants.map((user) => [`${user.lastName} ${user.firstName}`, user.userId]),
    );
    const caseTypeGroupIdByCalendarId = new Map(
      allCalendars.map((cal) => [cal.id, cal.caseTypeGroupId]),
    );
    const caseTypeGroupNameById = new Map(
      allCasetypeGroups.map((group) => [group.id, group.casetypegroup]),
    );

    // Step 3: for each hearing-date group, resolve the docket rows that would
    // have matched the legacy INNER JOINs, then resolve the casetype group for
    // each via v2_5_calendar_hearing_info -> v2_5_calendar -> casetypegroups.
    const results = [];

    for (const row of mainRows) {
      const docketRowsForDate = await Docket.findAll({
        where: { ...where, hearingDate: row.hearingDateRaw },
        attributes: ["hearingSite", "hearingTime", "judge", "judgeAssistant"],
        raw: true,
      });

      const caseTypeGroups = [];

      for (const docketRow of docketRowsForDate) {
        const courtLocationId = courtLocationIdByName.get(docketRow.hearingSite);
        const timeId = timeIdByStoredTime.get(docketRow.hearingTime);
        const judgeId = userIdByFullName.get(docketRow.judge);
        const cmaId = userIdByFullName.get(docketRow.judgeAssistant);

        // INNER JOIN semantics: skip rows that don't resolve against all four lookups
        if (!courtLocationId || !timeId || !judgeId || !cmaId) {
          continue;
        }

        const hearingInfo = await V2_5_Calendar_Hearing_Info.findOne({
          where: {
            judgeId,
            cmaId,
            timeId,
            courtLocationId,
            hearingDate: row.hearingDateRaw,
          },
          attributes: ["calendarId"],
          raw: true,
        });

        const caseTypeGroupId =
          hearingInfo && caseTypeGroupIdByCalendarId.get(hearingInfo.calendarId);
        const caseTypeGroupName =
          caseTypeGroupId !== undefined && caseTypeGroupNameById.get(caseTypeGroupId);

        if (caseTypeGroupName && !caseTypeGroups.includes(caseTypeGroupName)) {
          caseTypeGroups.push(caseTypeGroupName);
        }
      }

      results.push({
        id: `${row.hearingDateRaw}-${row.judge}-${row.courtLocation}`,
        hearingDate: row.hearingDate,
        caseTypeGroup: caseTypeGroups.join(", "),
        courtLocation: row.courtLocation,
        noOfCases: row.noOfCases,
        judge: row.judge,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Upcoming calendar data fetched successfully",
      data: results,
      success: true,
    });
  } catch (error) {
    logger.error("Error in getUpcomingCalendarData:", error);
    return res.status(500).json({
      status: 500,
      message: "Unable to fetch upcoming calendar data at this time. Please try again.",
      success: false,
    });
  }
};
