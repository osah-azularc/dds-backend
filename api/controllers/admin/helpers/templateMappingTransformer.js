import { Op } from "sequelize";

/**
 * Groups raw mapping rows (flat JOIN output) by mapping id,
 * deduplicating case types into an array per mapping.
 *
 * @param {object[]} mappingRows - Raw rows from DocumentTemplateCasetypeMapping.findAll (nest:true)
 * @returns {object[]} Grouped mappings array
 */
export const groupMappingRows = (mappingRows) => {
  const mappingsMap = new Map();

  for (const row of mappingRows) {
    if (!mappingsMap.has(row.id)) {
      mappingsMap.set(row.id, {
        id: row.id,
        agency: row.agency,
        casetypes: [],
        automationType: row.automation?.automationType || '',
        automationSubType: row.automation?.automationSubType || '',
      });
    }

    const mapping = mappingsMap.get(row.id);

    // Add casetype if not already present
    if (row.casetype && !mapping.casetypes.includes(row.casetype)) {
      mapping.casetypes.push(row.casetype);
    }
  }

  return Array.from(mappingsMap.values());
};

// scope_type column values: 0 = Decision, 2 = General, 3 = Both
const SCOPE_TYPE_DECISION = 0;
const SCOPE_TYPE_GENERAL = 2;
const SCOPE_TYPE_BOTH = 3;

/**
 * Converts scope_type numeric column value to frontend boolean flags.
 *
 * @param {number|string} scopeTypeNum
 * @returns {{ general: boolean, decision: boolean }}
 */
export const buildScopeTypeFlags = (scopeTypeNum) => {
  const num = Number(scopeTypeNum);
  return {
    general: num === SCOPE_TYPE_GENERAL || num === SCOPE_TYPE_BOTH,
    decision: num === SCOPE_TYPE_DECISION || num === SCOPE_TYPE_BOTH,
  };
};

/**
 * Converts is_spanishdoc DB value to dateFormat string.
 * is_spanishdoc = 1 → Spanish, is_spanishdoc = 0 → English
 *
 * @param {string|number} isSpanishdoc
 * @returns {'spanish'|'english'}
 */
export const normalizeDateFormat = (isSpanishdoc) =>
  String(isSpanishdoc) === '1' ? 'spanish' : 'english';

/**
 * Builds the Sequelize WHERE condition for casetype conflict detection.
 * When casetype is 'all', any existing row for the agency conflicts.
 * When casetype is specific, it conflicts with an exact match OR an existing 'all'.
 *
 * @param {string} casetype
 * @returns {object} Sequelize where clause fragment
 */
export const buildCasetypeConflictWhere = (casetype) =>
  casetype === 'all'
    ? {}
    : { casetype: { [Op.in]: [casetype, 'all'] } };
