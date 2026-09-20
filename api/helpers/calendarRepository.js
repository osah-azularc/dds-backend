import { Op, fn, col, where as seqWhere } from 'sequelize';
import Docket from '../models/Docket.js';
import AttorneyByCase from '../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';

/**
 * @typedef {Object} CalendarCase
 * @property {number} caseId
 * @property {string} name            - Petitioner / Respondent display name
 * @property {string|null} attorneyName
 * @property {string} caseType
 * @property {string|null} caseOfficial
 * @property {string} agencyRefNumber
 * @property {string} judgeAssistant
 * @property {string} hearingSite
 */

/**
 * @typedef {Object} CalendarGroup
 * @property {string} hearingTime     - Raw DB value, e.g. "09:00:00"
 * @property {string} county
 * @property {string} hearingSite
 * @property {CalendarCase[]} cases   - Deduplicated, sorted by name
 */

/**
 * Fetch all dockets for a given judge + hearing date and group them by hearing time.
 * Executes exactly 3 SQL queries regardless of result size (no N+1 pattern).
 *
 * @param {string} judge          - Judge name as stored in the docket table (e.g. "Malihi Michael")
 * @param {string} hearingDateStr - ISO date string or datetime; only the date part is used
 * @returns {Promise<CalendarGroup[]>} Hearing-time groups, each containing deduplicated cases
 */
export async function fetchCalendarGroups(judge, hearingDateStr) {
  // hearingDateStr must be a plain 'YYYY-MM-DD' string so the DATE() comparison
  // works correctly regardless of timezone offsets on the JS side.
  const dateOnly = hearingDateStr
    ? String(hearingDateStr).substring(0, 10)   // '2023-08-15T...' → '2023-08-15'
    : null;

  // Shared WHERE conditions — use fn('DATE', col('hearingdate')) to compare
  // just the date part (mirrors PHP: WHERE docket.hearingdate = '$hearingdate')
  const baseWhere = {
    judge,
    [Op.and]: [seqWhere(fn('DATE', col('hearingdate')), dateOnly)],
    status: { [Op.ne]: 'Closed' },
    telvOFive: '1',
  };

  // Query 1 — all dockets for this judge + date in a single round-trip.
  // No GROUP BY here — deduplication by caseId is handled in memory below,
  // avoiding ONLY_FULL_GROUP_BY violations on strict MySQL 5.7+ instances.
  // Sequelize always aliases SELECT columns with model attribute names (camelCase),
  // so raw: true results use camelCase keys regardless of the DB column name.
  const allDockets = await Docket.findAll({
    where: baseWhere,
    raw: true,
  });

  if (allDockets.length === 0) return [];

  const allCaseIds = allDockets.map((d) => d.caseId);

  // Queries 2 & 3 — batch-fetch attorneys and caseworkers in parallel using
  // a single IN clause each, then build O(1) lookup maps.
  const [attorneys, officials] = await Promise.all([
    AttorneyByCase.findAll({
      where: { caseId: { [Op.in]: allCaseIds }, typeOfContact: 'Petitioner Attorney' },
      raw: true,
    }),
    AgencyCaseworkerByCase.findAll({
      where: { caseId: { [Op.in]: allCaseIds } },
      raw: true,
    }),
  ]);

  // attorneyMap: caseId → first matching attorney row
  const attorneyMap = Object.fromEntries(attorneys.map((a) => [a.caseId, a]));

  // officialsMap: caseId → all caseworker rows for that case
  const officialsMap = {};
  for (const o of officials) {
    if (!officialsMap[o.caseId]) officialsMap[o.caseId] = [];
    officialsMap[o.caseId].push(o);
  }

  // Group dockets by hearingTime in memory (replaces the per-slot Docket.findAll loop).
  // Inner Map keyed by caseId deduplicates rows — first occurrence wins, matching the
  // original GROUP BY caseId behaviour without any SQL aggregation.
  const slotMap = new Map(); // hearingTime → { county, docketMap: Map<caseId, row> }
  for (const d of allDockets) {
    const t = d.hearingTime;
    if (!slotMap.has(t)) slotMap.set(t, { county: d.county || '', docketMap: new Map() });
    const { docketMap } = slotMap.get(t);
    if (!docketMap.has(d.caseId)) docketMap.set(d.caseId, d); // first row wins
  }

  const groups = [];

  for (const [slotTime, { county, docketMap }] of slotMap) {
    const cases = [...docketMap.values()].map((d) => {
      const caseId = d.caseId;

      // Petitioner / Respondent name — use casename if available (mirrors PHP)
      const name = d.caseName || 'No Party Added';

      // Petitioner Attorney — O(1) map lookup replaces findOne per docket
      const attorney = attorneyMap[caseId] || null;
      const attorneyName = attorney
        ? `${attorney.lastName || ''}, ${attorney.firstName || ''}`.trim().replace(/^,\s*/, '')
        : null;

      // Case Official — mirrors PHP printresultAction switch/else logic.
      // ALS → officer, CSS agency → Case Worker, OIG agency → Investigator,
      // default → first caseworker regardless of contact type (matches PHP else branch).
      const caseOfficials = officialsMap[caseId] || [];
      let official = null;
      if (d.caseType === 'ALS') {
        official = caseOfficials.find((o) => o.typeOfContact === 'officer') ?? null;
      } else if (d.refAgency === 'CSS') {
        official = caseOfficials.find((o) => o.typeOfContact === 'Case Worker') ?? null;
      } else if (d.refAgency === 'OIG') {
        official = caseOfficials.find((o) => o.typeOfContact === 'Investigator') ?? null;
      } else {
        official = caseOfficials[0] ?? null;
      }
      const caseOfficial = official
        ? `${official.lastName || ''}, ${official.firstName || ''}`.trim().replace(/^,\s*/, '')
        : null;

      return {
        caseId,
        name,
        attorneyName,
        caseType: d.caseType || '',
        caseOfficial,
        agencyRefNumber: d.agencyRefNumber || '',
        judgeAssistant: d.judgeAssistant || '',
        hearingSite: d.hearingSite || '',
      };
    });

    // Sort by name ASC (case-sensitive, mirrors PHP usort/strcmp), then by caseId DESC
    // as a secondary key — matches PHP's behaviour where equal-name rows retain the
    // descending caseId order from the original SQL result set.
    cases.sort((a, b) => {
      let nameCmp = 0;
      if (a.name < b.name) nameCmp = -1;
      else if (a.name > b.name) nameCmp = 1;
      if (nameCmp !== 0) return nameCmp;
      return b.caseId - a.caseId;
    });

    groups.push({
      hearingTime: slotTime,
      county,
      hearingSite: cases[0]?.hearingSite || '',
      cases,
    });
  }

  return groups;
}

