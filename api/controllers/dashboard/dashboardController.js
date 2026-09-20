import { Op } from "sequelize";
import Docket from "../../models/Docket.js";
import { handleComplexSearch } from "../../helpers/dashboardHelper.js";
import DocketDisposition from "../../models/DocketDisposition.js";
import {
  validateGeneralSearch,
  validateClosedCasesSearch,
  validateDocketInfoSearch,
} from "../../helpers/dashboardValidators.js";
import {
  buildGeneralSearchConditions,
  buildClosedCasesSearchConditions,
  applyDocumentFilters,
} from "../../helpers/dashboardQueryBuilder.js";
import {
  extractCaseIdFromLookup,
  getSearchDocketInfoData,
} from '../../helpers/searchDocketHelper.js';
import { logger } from "../../../config/winstonLogger.js";

// Default page size for pagination AND Offset
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_OFFSET = 0;

/**
 * Helper function to handle errors consistently across all search endpoints
 */
const handleSearchError = (error, res) => {
  // Handle validation errors
  if (error.isValidationError) {
    logger.error('Error in validation:', error);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      data: [],
      total: 0,
      error: error.message,
    });
  }

  // Handle other errors
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    data: [],
    total: 0,
    error: 'Internal server error',
  });
};

/**
 * General Search
 * Searches dockets with various filters using Sequelize models
 */
export const generalSearch = async (req, res) => {
  try {
    const validatedData = validateGeneralSearch(req.body);
    const { condition = {}, additionalCondition = {} } = validatedData;

    // Build where conditions using helper
    const whereConditions = buildGeneralSearchConditions(condition);

    // Apply special document filters (withDecisionDocument, withoutNOH, excludeNOH)
    const earlyResponse = await applyDocumentFilters(whereConditions, condition);
    if (earlyResponse) {
      return res.status(200).json(earlyResponse);
    }

    // Handle name search with contact type (requires complex joins)
    const fname = condition.firstName || '';
    const lname = condition.lastName || '';
    const contactType = condition.typeOfContact || '';

    if (contactType || fname || lname) {
      return await handleComplexSearch(condition, additionalCondition, whereConditions, fname, lname, contactType, res);
    }

    const orderField = additionalCondition.orderby || 'dateReceivedByOSAH';
    const orderDirection = additionalCondition.order === 1 ? 'DESC' : 'ASC';

    const queryOptions = {
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      attributes: [
        'caseId',
        'caseName',
        'refAgency',
        'caseType',
        'dateReceivedByOSAH',
        'dateRequested',
        'hearingDate',
        'hearingTime',
        'county',
        'hearingSite',
        'judge',
        'status',
        'agencyRefNumber',
      ],
      order: [[orderField, orderDirection]],
      limit: additionalCondition.length || DEFAULT_PAGE_SIZE,
      offset: additionalCondition.start || DEFAULT_OFFSET,
      distinct: true,
      col: 'caseId',
    };

    const { count, rows } = await Docket.findAndCountAll(queryOptions);

    return res.status(200).json({
      success: true,
      message: count > 0 ? 'Data fetched successfully' : 'No results found',
      data: rows,
      total: count,
      error: null,
    });
  } catch (error) {
    logger.error('❌ Error in generalSearch:', error);
    return handleSearchError(error, res);
  }
};


/**
 * Closed Cases Search
 * Searches closed dockets by date range and other filters using Sequelize models
 *
 * @route POST /dashboard/closeCaseSearch
 * @param {Object} req.body.condition - Search parameters (dcfrom, dcto required)
 * @param {Object} req.body.additionalCondition - Pagination and sorting parameters
 * @returns {Object} - { success: boolean, data: array, total: number, error: null }
 */
export const closedCasesSearch = async (req, res) => {
  try {
    // Validate and sanitize input
    const validatedData = validateClosedCasesSearch(req.body);
    const { condition = {}, additionalCondition = {} } = validatedData;

    // Build where conditions using helper
    const whereConditions = buildClosedCasesSearchConditions(condition);

    // Handle box number filter using Sequelize include (PHP lines 1392-1405)
    let boxnoInclude = null;
    if (condition.boxNo) {
      boxnoInclude = {
        model: DocketDisposition,
        as: 'docketdisposition',
        attributes: [],
        where: { boxNo: condition.boxNo },
        required: true, // INNER JOIN
      };
    }

    // Build query options
    const queryOptions = {
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      attributes: [
        'caseId',
        'caseName',
        'refAgency',
        'caseType',
        'dateReceivedByOSAH',
        'dateRequested',
        'hearingDate',
        'hearingTime',
        'county',
        'hearingSite',
        'judge',
        'status',
        'closedDate',
        'agencyRefNumber',
      ],
      // Add boxno include if present (replaces raw SQL subquery)
      include: boxnoInclude ? [boxnoInclude] : undefined,
      // PHP line 1388: order by with desc/asc based on param
      order: [[additionalCondition.orderby || 'dateReceivedByOSAH', additionalCondition.order ? 'DESC' : 'ASC']],
      limit: additionalCondition.length || DEFAULT_PAGE_SIZE,
      offset: additionalCondition.start || DEFAULT_OFFSET,
      distinct: true, // Ensure COUNT(DISTINCT caseid) when using include
      subQuery: false, // Prevent subquery issues with INNER JOIN
    };

    // Execute query with count
    const { count, rows } = await Docket.findAndCountAll(queryOptions);

    // PHP line 1412: Check if total > 0 before returning data
    return res.status(200).json({
      success: true,
      message: count > 0 ? 'Data fetched successfully' : 'No closed cases found',
      data: count > 0 ? rows : [],
      total: count,
      error: null,
    });
  } catch (error) {
    return handleSearchError(error, res);
  }
};

/**
 * Search Docket Info
 * Validates docket number and returns complete docket information
 *
 * @route POST /dashboard/searchDocketInfo
 * @param {Object} req.body.tableName - Table name (should be 'docketsearch')
 * @param {String} req.body.docketnumber - Raw docket number input (numeric or prefixed)
 * @returns {Object} - Standard response with docketData, peopleData, minorData, custodialParent, docketDisposition
 */
export const searchDocketInfo = async (req, res) => {
  try {
    const validatedData = validateDocketInfoSearch(req.body);
    const caseId = extractCaseIdFromLookup(validatedData);

    if (!caseId) {
      throw Object.assign(new Error('Invalid caseid condition'), {
        isValidationError: true,
      });
    }
    const data = await getSearchDocketInfoData(caseId);

    return res.status(200).json({
      success: true,
      message: 'Docket information retrieved successfully',
      data,
      error: null,
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: {
          docketData: '',
          peopleData: '',
          minorData: '',
          custodialParent: '',
          docketDisposition: null,
        },
        error: error.message,
      });
    }

    return res.status(200).send('404');
  }
};

