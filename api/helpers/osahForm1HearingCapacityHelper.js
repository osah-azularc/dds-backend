import {
  V2_5_Calendar_Hearing_Info,
  HearingTime,
  CourtLocations,
  Docket,
} from '../models/index.js';

/**
 * Helper: Convert value to integer or null
 * @private
 */
const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Helper: Parse hearing date string to ISO format
 * @private
 */
const parseHearingDate = (hearingDate) => {
  if (!hearingDate) return null;
  const d = new Date(hearingDate.replaceAll('-', '/'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * Helper: Check if capacity limit is exceeded for a slot
 * @private
 */
const isCapacityExceeded = async (slot) => {
  if (!slot || slot.noOfCases === null) return false;

  const htStored = slot.hearingTime?.hearingTimeStored ?? null;
  const locName = slot.courtLocation?.locationName ?? null;

  const docketCount = await Docket.count({
    where: { hearingDate: slot.hearingDate, hearingTime: htStored, hearingSite: locName },
  });

  return docketCount >= slot.noOfCases;
};

/**
 * Helper: Find hearing slot for the given parameters
 * @private
 */
const findHearingSlot = async (judgeId, assistantId, effectiveTimeId, locationId, formattedDate) => {
  return V2_5_Calendar_Hearing_Info.findOne({
    where: {
      judgeId,
      cmaId: assistantId,
      timeId: effectiveTimeId,
      courtLocationId: locationId,
      hearingDate: formattedDate,
    },
    include: [
      { model: HearingTime, as: 'hearingTime', attributes: ['hearingTimeStored'] },
      { model: CourtLocations, as: 'courtLocation', attributes: ['locationName'] },
    ],
  });
};

/**
 * @description Validates a manually-entered hearing slot against capacity limits.
 *              Replicates legacy CalendarModel::hearingDateManual().
 * @param {Object} condition
 * @returns {Promise<{ token, hearingDateValEnteredByUser, error: string }>}
 */
export async function checkHearingDateManual(condition) {
  const { token, hearingDateValEnteredByUser } = condition;

  // Early return for empty token
  if (!token) {
    return {
      token: token ?? '',
      hearingDateValEnteredByUser: hearingDateValEnteredByUser ?? false,
      error: '',
    };
  }

  const responseData = {
    token,
    hearingDateValEnteredByUser: hearingDateValEnteredByUser ?? false,
    error: '',
  };

  // Extract and parse condition parameters
  const {
    judge_id,
    judge_assistant_id,
    court_location_id,
    casetype_id,
    casetype,
    hearingTimeId,
    hearingTime,
    hearingDate,
  } = condition;

  const judgeId = toInt(judge_id);
  const assistantId = toInt(judge_assistant_id);
  const locationId = toInt(court_location_id);
  const caseTypeId = toInt(casetype_id);

  // Validate required fields
  const hasRequiredFields = judgeId && assistantId && locationId && caseTypeId && casetype && hearingTime;
  if (!hasRequiredFields) return responseData;

  // Parse and validate hearing date
  const formattedDate = parseHearingDate(hearingDate);
  if (!formattedDate) return responseData;

  // Resolve hearing time ID
  const resolvedHearingTime = await HearingTime.findOne({
    attributes: ['timeId'],
    where: { hearingTimeStored: hearingTime },
  });
  const effectiveTimeId = resolvedHearingTime?.timeId ?? toInt(hearingTimeId);
  if (!effectiveTimeId) return responseData;

  // Find hearing slot and check capacity
  const slot = await findHearingSlot(judgeId, assistantId, effectiveTimeId, locationId, formattedDate);
  const capacityExceeded = await isCapacityExceeded(slot);

  if (capacityExceeded) {
    responseData.error = 'maxNoOfCasesLimit';
  }

  return responseData;
}