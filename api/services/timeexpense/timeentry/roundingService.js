/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Canonical port of legacy's equalSplitIndividualTime / equalSplitTotalTime /
                convertH2M (timeentrycontroller.js:465-570) -- the exact two-pass rounding
                and multi-agency split math, including the documented drift between passes
                (Time Tracking Audit, decision #10: preserved deliberately -- it's what
                legacy actually persists as rounded_up_time/split_time_btwn_agency, not an
                accidental bug to silently "fix" into a naive single round-to-15).

                This is the sole authority for these values: create/edit recompute them here
                server-side from raw hours/minutes/agency-count rather than trusting
                client-sent values (decision #9/#10 -- no client-side re-derivation drift).
                The frontend calls an identical algorithm (utilities/timeEntryRounding.js)
                purely for live preview before save.
*/

export function convertH2M(hhmm) {
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

// Matches equalSplitIndividualTime's rounding rule: anything under 8 minutes (but above
// zero) floors straight to 15 rather than rounding proportionally.
function roundToQuarterHourWithFloor(totalMinutes) {
  if (totalMinutes > 0 && totalMinutes < 8) return 15;
  return Math.round(totalMinutes / 15) * 15;
}

// Matches equalSplitTotalTime's rounding rule -- plain round-to-nearest-15, no <8min floor.
function roundToQuarterHour(totalMinutes) {
  return Math.round(totalMinutes / 15) * 15;
}

function minutesToHHMMSS(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

/**
 * @param {object} input
 * @param {number} input.hours
 * @param {number} input.minutes
 * @param {number} input.agencyCount - number of agencies the entry is split across (>= 1)
 * @returns {{originalWorkingTime: string, splitTimeBtwnAgency: string, roundedUpTime: string}}
 *   TIME-formatted (HH:MM:SS) strings, ready to persist on the time_entry row.
 */
export function computeTimeEntryDurations({ hours, minutes, agencyCount }) {
  const rawMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const count = Math.max(1, Number(agencyCount) || 1);

  // Pass 1 (equalSplitIndividualTime): round the raw entry to the nearest quarter hour,
  // then split evenly across agencies -- hours floored, minutes rounded independently, so
  // splitPerAgency * count does not necessarily reconstruct the pass-1 rounded value.
  const roundedRaw = roundToQuarterHourWithFloor(rawMinutes);
  const splitMinutesRaw = roundedRaw / count;
  const splitHours = Math.round(Math.floor(splitMinutesRaw / 60));
  const splitMinutesPart = Math.round(splitMinutesRaw % 60);
  const splitPerAgencyMinutes = splitHours * 60 + splitMinutesPart;

  // Pass 2 (equalSplitTotalTime): multiply the per-agency split back out by agency count
  // and round to the nearest quarter hour again -- this becomes the persisted total.
  const totalFromSplit = splitPerAgencyMinutes * count;
  const roundedTotal = roundToQuarterHour(totalFromSplit);

  return {
    originalWorkingTime: minutesToHHMMSS(rawMinutes),
    splitTimeBtwnAgency: minutesToHHMMSS(splitPerAgencyMinutes),
    roundedUpTime: minutesToHHMMSS(roundedTotal),
  };
}
