import { CasetypeRestriction, Holidays } from "../../models/index.js";

// ========================================
// IN-MEMORY CACHE FOR STATIC DATA
// ========================================

/**
 * Cache for casetype restrictions and holidays data
 * These tables rarely change, so we cache them in memory to avoid N+1 queries
 * Cache is invalidated after 1 hour or can be manually cleared
 */
let staticDataCache = {
  casetypeRestrictions: null,
  holidays: null,
  lastFetched: null,
  ttl: 60 * 60 * 1000, // 1 hour in milliseconds
};

/**
 * Fetch static data (casetype restrictions and holidays) with caching
 * Eliminates N+1 query problem by caching data that rarely changes
 * @returns {Promise<Object>} Object containing casetypeRestrictionData and holidaysData
 */
export async function getStaticDataWithCache() {
  const now = Date.now();

  // Check if cache is valid
  if (
    staticDataCache.casetypeRestrictions &&
    staticDataCache.holidays &&
    staticDataCache.lastFetched &&
    (now - staticDataCache.lastFetched) < staticDataCache.ttl
  ) {
    // Return cached data
    return {
      casetypeRestrictionData: staticDataCache.casetypeRestrictions,
      holidaysData: staticDataCache.holidays,
    };
  }

  // Cache is invalid or expired, fetch fresh data
  const [casetypeRestrictionData, holidaysData] = await Promise.all([
    CasetypeRestriction.findAll({
      attributes: ['id', 'agency', 'caseType', 'noHearing', 'noHearingType', 'noHearingCalcFrom', 'noDecision', 'noDecisionType', 'noDecisionCalcFrom'],
      logging: false,
    }),
    Holidays.findAll({
      attributes: ['id', 'type', 'week', 'dateDay', 'month'],
      logging: false,
    })
  ]);

  // Update cache
  staticDataCache.casetypeRestrictions = casetypeRestrictionData;
  staticDataCache.holidays = holidaysData;
  staticDataCache.lastFetched = now;

  return { casetypeRestrictionData, holidaysData };
}

/**
 * Clear the static data cache
 * Call this function when casetype restrictions or holidays are updated
 * @returns {void}
 */
export function clearStaticDataCache() {
  staticDataCache.casetypeRestrictions = null;
  staticDataCache.holidays = null;
  staticDataCache.lastFetched = null;
}

