// Shared helpers used by both checkinCalendarListService.js (today's
// check-in list) and checkinStartCheckinService.js (starting check-in for a
// judge's dockets) - kept here so the "what counts as today's docket" and
// "how do we resolve a judge_assistant_clerk id down to the free-text name
// docket actually stores" logic stays identical between the two.
import { Sequelize } from "sequelize";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";

// "Today" here deliberately means the UTC calendar day, not
// America/New_York (unlike timeUtils.js's localNow(), which most of the
// rest of this app uses) - legacy OsahCheckInCalenderController.php calls
// date_default_timezone_set('UTC') at file scope before computing
// currentDate = date("Y-m-d"), so every checkin/* endpoint's "today" has
// always run on UTC's clock, not Atlanta's. That's an inconsistency in the
// legacy app itself (most other legacy controllers do set
// America/New_York), but matching *this* module's actual behavior means
// staying on UTC here too - don't "fix" this to localNow() without also
// fixing the legacy PHP side, or the two will disagree on which calendar
// day a case belongs to.
// Returned as a plain 'YYYY-MM-DD' UTC-date string (not a Date object) so
// callers can hand it straight to Sequelize for an exact-equality match on
// a DATETIME column - MySQL treats the string literal as that day's
// midnight directly, with no JS Date-to-SQL timezone conversion in the way
// (mirrors the same hearingDate-vs-'YYYY-MM-DD' pattern already used in
// calendarController.js). Both getListOfTodaysCalendars and
// saveStartCheckinCalendar match `hearingDate` against this by exact
// equality (legacy's own d.hearingdate = '$currentDate'), not a >=/< range -
// docket.hearingdate is always stored at midnight, with the actual
// scheduled time kept separately in hearingtime.
export const todayDateOnly = () => new Date().toISOString().slice(0, 10);

// Yesterday's UTC calendar day - same convention as todayDateOnly() above, one day
// earlier. Used by pastCalendarActiveSnapshotService.js's Job 2, which runs the day
// after a hearing to finalize that hearing date's snapshot rows.
export const yesterdayDateOnly = () => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
};

// [todayStart, tomorrowStart) as UTC-midnight Date boundaries for the same "today" as
// todayDateOnly() above - for callers that need a >=/< range match (e.g. Job 1's
// pastCalendarInactiveSnapshotService.js, which can't use Sequelize.fn('DATE', ...)
// the way checkinCalendarListService.js/saveStartCheckinCalendar do) against a
// DATETIME column storing that date at midnight.
export const getTodayDateRange = () => {
  const todayStart = new Date(`${todayDateOnly()}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, tomorrowStart };
};

// Mirrors legacy's own WHERE fragment exactly:
//   d.status <> 'Closed' OR ( d.status = 'Closed' AND d.closed_date IS NOT NULL
//     AND d.closed_date = d.hearingdate )
// i.e. gated on the `status` text column, not closed_date nullness - and a
// Closed case still counts if it was closed *on its own hearing date*
// (closed_date = hearingdate), not "closed today". A case closed on some
// other day (rescheduled after closing, or closed_date stale from a prior
// hearing date) is excluded even if it's otherwise in today's list.
// Sequelize.col() takes the actual DB column names (closed_date/hearingdate),
// not the camelCase JS attributes - unlike a plain where-key, it isn't run
// through the model's field mapping.
export const buildNotClosedCondition = () => ({
  [Sequelize.Op.or]: [
    { status: { [Sequelize.Op.ne]: "Closed" } },
    {
      [Sequelize.Op.and]: [
        { status: "Closed" },
        { closedDate: { [Sequelize.Op.ne]: null } },
        Sequelize.where(
          Sequelize.col("closed_date"),
          Sequelize.col("hearingdate"),
        ),
      ],
    },
  ],
});

// "LastName FirstName" concat, matching JudgeAssistantClerk's
// judgeAssistantClerkConcat virtual field - what checkin_calendar_today_date
// stores in judge_name/cma, and what docket.judge/docket.judgeAssistant
// store too. Takes an already-fetched {firstName, lastName} record; shared
// by resolveStaffConcat below and by checkinInfoListService.js /
// checkinCalendarListService.js, which already have the record in hand from
// a batch query and don't need the extra per-id lookup.
export const formatStaffConcat = (record) =>
  `${record?.lastName ?? ""} ${record?.firstName ?? ""}`.trim();

/** judge_id/cma_id (judge_assistant_clerk user id) -> "LastName FirstName" concat string, or null if not found */
export const resolveStaffConcat = async (userId) => {
  const staff = await JudgeAssistantClerk.findByPk(userId, {
    attributes: ["firstName", "lastName"],
  });
  return staff ? formatStaffConcat(staff) : null;
};

// ── Party-lookup helpers ────────────────────────────────────────────────────
// Shared between checkinStartCheckinService.js ("Start Check-in" for a judge, which
// runs these lookups for today's dockets) and pastCalendarActiveSnapshotService.js
// (Job 2, which re-runs the identical lookups for yesterday's dockets that never went
// through the digital check-in flow) - kept here so both stay resolving case
// official/petitioner/respondent-attorney the exact same way.

export const formatPartyName = (row) => {
  const last = (row?.lastName || "").trim();
  const first = (row?.firstName || "").trim();
  if (!last && !first) return null;
  return first ? `${last}, ${first}` : last;
};

/**
 * Case Official - which typeofcontact to pull from agencycaseworkerbycase
 * depends on the docket's case type/agency:
 *   caseType == 'ALS'                          -> 'Officer'
 *   agency == 'OIG' OR caseType == 'EBTFSF'     -> 'Investigator'
 *   agency in ('CSS','DFCS','DFCS-M')           -> 'Case Worker'
 *     EXCEPT agency == 'CSS' AND caseType == 'EST' -> 'Agency Contact'
 *   everything else                             -> 'Agency Contact'
 * `officials` must already be sorted most-recent-first (createdDate DESC) by
 * the caller - findByType takes the first match, i.e. the most recently
 * created record of that type. Matched case-insensitively like
 * searchResultsExportHelper.js's pickCaseOfficial.
 */
export const pickCaseOfficial = (officials, caseType, refAgency) => {
  if (!officials?.length) return null;
  const findByType = (type) =>
    officials.find(
      (o) =>
        String(o.typeOfContact || "")
          .trim()
          .toLowerCase() === type.toLowerCase(),
    );

  let match;
  if (caseType === "ALS") {
    match = findByType("Officer");
  } else if (refAgency === "OIG" || caseType === "EBTFSF") {
    match = findByType("Investigator");
  } else if (["CSS", "DFCS", "DFCS-M"].includes(refAgency)) {
    match =
      refAgency === "CSS" && caseType === "EST"
        ? findByType("Agency Contact")
        : findByType("Case Worker");
  } else {
    match = findByType("Agency Contact");
  }

  return formatPartyName(match);
};

/**
 * Petitioner Attorney/Representative shown on the check-in card - per AC #12
 * of Story #1 and AC #9 of Story #7, a Petitioner Attorney (attorneybycase,
 * typeOfContact "Petitioner Attorney") always wins when the case has both an
 * attorney and a Representative; the Representative (peopledetails) is shown
 * only when the case has no Petitioner Attorney. A plain Petitioner
 * (typeOfContact "Petitioner") is not a valid fallback here and is
 * intentionally not returned - this field is Petitioner Attorney/
 * Representative only.
 * petOrRep records which one was actually found, EXCEPT the Petitioner
 * Attorney case: that's the default/no-caption case on the check-in grid
 * (checkInInfoColumns.jsx only prints a caption under the name for
 * "Representative", and already treats an unset petOrRep as "Petitioner
 * Attorney" when sending an update), so petOrRep comes back null there
 * rather than the redundant "Petitioner Attorney" string.
 * `petitionerAttorneyRow` is a single already-resolved row (the caller picks
 * the most-recently-created one when a case has more than one Petitioner
 * Attorney - see checkinStartCheckinService.js's petitionerAttorneyByCase),
 * not an array. `peopleRows` must likewise already be sorted most-recent-
 * first (createdDate DESC) so .find() below picks the latest Representative
 * record, not whichever the DB happened to return first.
 */
export const pickPetitionerOrRepresentative = (
  petitionerAttorneyRow,
  peopleRows,
) => {
  if (petitionerAttorneyRow)
    return {
      name: formatPartyName(petitionerAttorneyRow),
      petOrRep: null,
    };

  const representative = peopleRows.find(
    (p) => p.typeOfContact === "Representative",
  );
  if (representative)
    return {
      name: formatPartyName(representative),
      petOrRep: "Representative",
    };

  return { name: null, petOrRep: null };
};
