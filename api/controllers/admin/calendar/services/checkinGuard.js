// Frozen-snapshot guard - once pastCalendarActiveSnapshotService.js (Job 2) has flipped
// a (docket_caseid, hearing_date) row to active_past_calendar = '1', that day's data is
// a permanent historical record and must never be editable from the live Check-In screen
// again, even if the docket's hearing_date somehow still matched "today" (e.g. a clock
// skew, or the case being re-heard on a later date without a fresh checkin row).
//
// This is deliberately an explicit check against past_calendar_snapshot on every
// check-in write path, not just an assumption that "the check-in screen only ever
// queries today's date so it can never touch a finalized day" - that scoping is real
// (see checkinCalendarListService.js/checkinInfoListService.js's todayDateOnly() calls)
// but it's implicit, and a future write endpoint that forgets to scope by date would
// silently corrupt a frozen record. Checking here instead means every write path is
// protected the same way regardless of how it got its date.
import PastCalendarSnapshot from "../../../../models/PastCalendarSnapshot.js";
import { CalendarServiceError } from "./calendarServiceError.js";

export const FROZEN_RECORD_MESSAGE =
  "This hearing day has already been finalized into the historical record and can no longer be edited from Check-In.";

/**
 * Throws CalendarServiceError(409, ...) if (docketCaseId, hearingDate) has already been
 * finalized into past_calendar_snapshot. A no-op (never blocks) when either id is
 * missing, so callers that haven't resolved a hearing date yet aren't forced to guard
 * twice - resolve first, then call this once you have both.
 */
export const assertCheckinRecordIsEditable = async ({ docketCaseId, hearingDate }) => {
  if (!docketCaseId || !hearingDate) return;

  const frozen = await PastCalendarSnapshot.findOne({
    where: { docketCaseId, hearingDate, activePastCalendar: "1" },
    attributes: ["id"],
  });

  if (frozen) {
    throw new CalendarServiceError(409, FROZEN_RECORD_MESSAGE);
  }
};

/**
 * Batch variant for write paths that process many dockets at once (e.g.
 * saveStartCheckinCalendar upserting every docket for a judge/day) - returns the set of
 * docketCaseIds that are frozen for hearingDate, so the caller can filter them out of
 * the batch instead of throwing and aborting the whole operation.
 */
export const getFrozenDocketCaseIds = async ({ docketCaseIds, hearingDate }) => {
  if (!docketCaseIds?.length || !hearingDate) return new Set();

  const frozenRows = await PastCalendarSnapshot.findAll({
    where: { docketCaseId: docketCaseIds, hearingDate, activePastCalendar: "1" },
    attributes: ["docketCaseId"],
    raw: true,
  });

  return new Set(frozenRows.map((row) => row.docketCaseId));
};
