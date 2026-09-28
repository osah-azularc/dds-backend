import { Op } from 'sequelize';
import StatusList from '../../models/StatusList.js';
import DdsStatusList from '../../models/DdsStatusList.js';
import Agency from '../../models/admin/agencyModel.js';
import Casetypes from '../../models/Casetypes.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import County from '../../models/County.js';
import States from '../../models/States.js';
import CourtLocations from '../../models/CourtLocations.js';
import TypeOfContact from '../../models/TypeOfContact.js';
import HearingMode from '../../models/HearingMode.js';
import HearingTime from '../../models/calendar/HearingTimeModel.js';
import ReopenReason from '../../models/ReopenReason.js';
import { logger } from "../../../config/winstonLogger.js";

/*
    Created by  : Snehal Narkar
    Date        : 20-11-2025
    Description : Get data dynamically from any table with conditions.
                  PHP Method  : OsahformController::getdatadynamicAction()
                  Request     : { tblNm, field_nm?, field_val?, cond_type?, activeOnly? }
                  Response    : { success, message, data }
                  activeOnly  : When true, adds isActive='1' to the WHERE clause
                                so that osahforme dropdowns show only active
                                records without the frontend passing a second condition.
*/
const ALLOWED_TABLES = {
  'agency':               { model: Agency,             sortField: 'agencyCode',   hasActiveFilter: true  },
  'casetypes':            { model: Casetypes,           sortField: 'caseCode',     hasActiveFilter: true  },
  'judge_assistant_clerk':{ model: JudgeAssistantClerk, sortField: null,           hasActiveFilter: true  },
  'county':               { model: County,              sortField: 'CountyID',     hasActiveFilter: false },
  'states':               { model: States,              sortField: 'state',        hasActiveFilter: false },
  'courtlocations':       { model: CourtLocations,      sortField: 'locationName', hasActiveFilter: true  },
  'typeofcontact':        { model: TypeOfContact,       sortField: 'partyContact', hasActiveFilter: false },
  'hearingmode':          { model: HearingMode,         sortField: 'hearingValues',hasActiveFilter: false },
  'hearingtime':          { model: HearingTime,         sortField: 'timeId',       hasActiveFilter: false },
  'reopen_reason':        { model: ReopenReason,        sortField: 'reasons',      hasActiveFilter: false },
};

// ✅ SECURE - Whitelist of allowed operators
const ALLOWED_OPERATORS = {
  '1': Op.eq,
  '2': Op.ne,
  '3': Op.lt,
  '4': Op.gt,
  '5': Op.lte,
  '6': Op.gte,
};

async function getDataDynamic(req, res) {
  try {
    const { tblNm, field_nm, field_val, cond_type, activeOnly } = req.body || {};

    // tblNm is always required
    if (!tblNm) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: tblNm',
        error: 'tblNm is required',
      });
    }

    // ✅ Validate table name against whitelist
    if (!ALLOWED_TABLES[tblNm]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid table name',
        error: `Table '${tblNm}' is not allowed`,
      });
    }

    const { model, sortField, hasActiveFilter } = ALLOWED_TABLES[tblNm];
    const whereCondition = {};

    // Optional field condition — if provided all three parts must be present
    if (field_nm !== undefined || field_val !== undefined || cond_type !== undefined) {
      if (!field_nm || field_val === undefined || !cond_type) {
        return res.status(400).json({
          success: false,
          message: 'When filtering, field_nm, field_val, and cond_type are all required',
          error: 'Incomplete filter parameters',
        });
      }
      // ✅ Validate operator
      const operator = ALLOWED_OPERATORS[cond_type];
      if (!operator) {
        return res.status(400).json({
          success: false,
          message: 'Invalid condition type',
          error: 'cond_type must be between 1 and 6',
        });
      }
      whereCondition[field_nm] = { [operator]: field_val };
    }

    // activeOnly=true → append isActive='1' (only for tables that have the column)
    if (activeOnly === true && hasActiveFilter) {
      whereCondition.isActive = '1';
    }

    // Special rule for judge_assistant_clerk — exclude test accounts
    if (tblNm === 'judge_assistant_clerk') {
      whereCondition.firstName = { [Op.ne]: 'Test' };
    }

    // ✅ Build order clause
    const orderClause = sortField ? [[sortField, 'ASC']] : [];

    // ✅ Execute query using Sequelize model
    const result = await model.findAll({ where: whereCondition, order: orderClause });

    return res.status(200).json({
      success: true,
      message: 'Data fetched successfully',
      data: result.map((item) => item.toJSON()),
    });

  } catch (error) {
    logger.error('Error in getDataDynamic:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch data',
      error: 'Internal server error',
    });
  }
}


/**
 * Search data by where condition
 * Used for fetching dropdown data like contact types, hearing types
 * This is a simplified version of getDataDynamic for dashboard use
 *
 * @route POST /dashboard/searchDataByWhere
 * @param {string} tableName - Name of the table to query
 * @param {string} condition - WHERE clause condition (e.g., "id != 0")
 * @returns {Object} - { success: boolean, data: array, error: null }
 */
export const searchDataByWhere = async (req, res) => {
  try {
    const { tableName, condition } = req.body;

    if (!tableName || !condition) {
      return res.status(400).json({
        success: false,
        message: 'tableName and condition are required',
        data: [],
        error: null,
      });
    }

    // ✅ Validate table name against whitelist
    if (!ALLOWED_TABLES[tableName]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid table name',
        data: [],
        error: `Table '${tableName}' is not allowed`,
      });
    }

    const { model, sortField } = ALLOWED_TABLES[tableName];

    const whereCondition = parseSimpleCondition(model, condition);
    if (whereCondition === null) {
      return res.status(400).json({
        success: false,
        message: 'Invalid condition format',
        data: [],
        error: 'Unsupported searchDataByWhere condition',
      });
    }

    // Build order clause
    const orderClause = sortField ? [[sortField, 'ASC']] : [];

    const results = await model.findAll({
      where: whereCondition,
      order: orderClause,
    });

    return res.status(200).json({
      success: true,
      message: 'Data fetched successfully',
      data: results,
      error: null,
    });
  } catch (error) {
    logger.error('❌ Error in searchDataByWhere:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: [],
      error: 'Internal server error',
    });
  }
};

/**
 * Helper function to parse simple condition strings
 * Supports both single clauses like "id != 0" and AND clauses like
 * "AgencyID=268 && Active='1' && is_active='1'".
 */
function parseSimpleCondition(model, condition) {
  const operatorMap = {
    '!=': Op.ne,
    '>=': Op.gte,
    '<=': Op.lte,
    '=': Op.eq,
    '>': Op.gt,
    '<': Op.lt,
  };

  const toAttributeName = (rawField) => {
    const field = String(rawField || '').trim();
    const attrs = model?.rawAttributes || {};
    const attributeName = Object.keys(attrs).find((key) => key.toLowerCase() === field.toLowerCase());
    if (attributeName) return attributeName;
    const dbFieldMatch = Object.entries(attrs).find(([, value]) => String(value?.field || '').toLowerCase() === field.toLowerCase());
    return dbFieldMatch?.[0] ?? null;
  };

  const parseValue = (rawValue) => {
    const valueText = String(rawValue || '').trim();
    const quoted = /^(?:['"]).*(?:['"])$/.test(valueText);
    const unquoted = valueText.replaceAll(/(?:^['"])|(?:['"]$)/g, '');
    const isNumeric = !quoted && /^-?\d+(?:\.\d+)?$/.test(unquoted);

    return {
      value: isNumeric ? Number(unquoted) : unquoted,
    };
  };

  const clauses = String(condition || '')
    .split(/\s{0,20}(?:&&|AND)\s{0,20}/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // Bounded quantifiers (vs. unbounded \s*/.+) keep worst-case backtracking
      // cost constant regardless of the length of this attacker-controlled string.
      const match = /^(\w{1,64})\s{0,20}(>=|<=|!=|=|>|<)\s{0,20}(.{1,255})$/.exec(part);
      if (!match) return null;
      const [, rawField, operator, rawValue] = match;
      const field = toAttributeName(rawField);
      if (!field || !operatorMap[operator]) return null;
      const { value } = parseValue(rawValue);
      return { [field]: { [operatorMap[operator]]: value } };
    });

  if (!clauses.length || clauses.includes(null)) return null;
  return clauses.length === 1 ? clauses[0] : { [Op.and]: clauses };
}

/*
    Created by  : Snehal Narkar
    Date        : 20-11-2025
    Description : Get docket status list with text normalization
    Request     : No parameters
    Response    : { success, message, data }
*/
async function getDocketStatusList(_req, res) {
  try {
    const result = await StatusList.findAll({
      attributes: ['id', 'statusList']
    });

    // Transform data: Replace 'Hearing Re-Scheduled' with 'Rescheduled' in JavaScript
    const transformedResult = result.map(item => ({
      id: item.id,
      statusList: item.statusList?.replaceAll('Hearing Re-Scheduled', 'Rescheduled') || item.statusList
    }));

    return res.status(200).json({
      success: true,
      message: 'Docket status list fetched successfully',
      data: transformedResult
    });

  } catch (error) {
    logger.error('Error in getDocketStatusList:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch docket status list',
      error: 'Failed to fetch docket status list'
    });
  }
}

/*
    Description : Get the DDS-specific docket status list (distinct from the
                  generic OSAH statuslist table used by getDocketStatusList).
                  PHP Method  : OsahformController::getdocketddslistAction()
                  Request     : No parameters
                  Response    : { success, message, data }
*/
async function getDdsDocketStatusList(_req, res) {
  try {
    // Multiple raw `status` rows can share one `display_name` (e.g. "Draft"
    // covers both "pending" and "cloned"). Ordering by id and keeping only
    // the first row per display_name reproduces one representative status
    // per display_name, matching the dropdown's expected shape.
    const rows = await DdsStatusList.findAll({
      where: { status: { [Op.ne]: 'rejected' } },
      order: [['id', 'ASC']],
    });

    const seenDisplayNames = new Set();
    const result = [];
    for (const row of rows) {
      if (seenDisplayNames.has(row.displayName)) continue;
      seenDisplayNames.add(row.displayName);
      result.push({ id: row.id, display_name: row.displayName, statusList: row.status });
    }

    return res.status(200).json({
      success: true,
      message: 'DDS docket status list fetched successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in getDdsDocketStatusList:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch DDS docket status list',
      error: 'Failed to fetch DDS docket status list',
    });
  }
}

export { getDataDynamic, getDocketStatusList, getDdsDocketStatusList };

