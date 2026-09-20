import Form1Docket from '../models/Form1Docket.js';
import { Op, Sequelize } from 'sequelize';
import { logger } from '../../config/winstonLogger.js';
import {
	  getAllFilterOptions,
	  updateForm1ClerkAssignments,
	  getForm1ById,
	  getForm1ReviewData,
	  getCaseTypesByAgencies,
	} from '../services/reviewForm1Service.js';
import { parsePagination } from '../helpers/reviewForm1/paginationHelper.js';

// Chief clerks may view any Form 1; a regular clerk only one assigned to them (closes an IDOR gap).
const canViewForm1 = (req, docketinfo) => {
  if (Number(req.user?.review_form1s) === 1) return true;
  const loggedUserName = req.user?.email ? String(req.user.email).split('@')[0] : null;
  return !!loggedUserName && docketinfo.docketClerk === loggedUserName;
};

/** Get unassigned Form 1s with filtering. Unassigned = no docketclerk assigned. */
export const getUnassignedForm1s = async (req, res) => {
  try {
    // Unassigned queue is chief-clerk only (mirrors legacy ng-show="is_chiefclerk == '1'").
    if (Number(req.user?.review_form1s) !== 1) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view unassigned Form 1s',
      });
    }

    const {
      agency = '',
      caseType = '',
      dateReceived = '',
      dateReceivedFrom = '',
      dateReceivedTo = '',
      searchValue = '',
      limit = 50,
      offset = 0,
      orderby = 'agencyrefnumber',
      ascdesc = 'ASC',
    } = req.body;

    // Base where conditions: unassigned, submitted, scanned
    const whereConditions = {
      docketClerk: { [Op.or]: [null, ''] },
      status: 'submitted',
      isFileScanned: '1',
    };

    const hasAgencyFilter =
      (Array.isArray(agency) && agency.length > 0) ||
      (typeof agency === 'string' && agency);
    const hasCaseTypeFilter =
      (Array.isArray(caseType) && caseType.length > 0) ||
      (typeof caseType === 'string' && caseType);
    const hasCustomDateRange = !!(dateReceivedFrom || dateReceivedTo);
    const hasSingleDate = !!dateReceived;
    const hasNonSearchFilters =
      hasAgencyFilter || hasCaseTypeFilter || hasCustomDateRange || hasSingleDate;

    // Handle array values for agency (multiple select) — filters by
    // agencyPlatformId, matching legacy osah.repos exactly (not refAgency).
    if (Array.isArray(agency) && agency.length > 0) {
      whereConditions.agencyPlatformId = { [Op.in]: agency };
    } else if (typeof agency === 'string' && agency) {
      whereConditions.agencyPlatformId = agency;
    }

    // Handle array values for caseType (multiple select)
    if (Array.isArray(caseType) && caseType.length > 0) {
      whereConditions.caseType = { [Op.in]: caseType };
    } else if (typeof caseType === 'string' && caseType) {
      whereConditions.caseType = caseType;
    }

    // Date handling
    if (hasCustomDateRange) {
      const range = {};
      if (dateReceivedFrom) {
        range[Op.gte] = new Date(dateReceivedFrom);
      }
      if (dateReceivedTo) {
        const toDate = new Date(dateReceivedTo);
        // Make the upper bound exclusive of the next day
        toDate.setDate(toDate.getDate() + 1);
        range[Op.lt] = toDate;
      }

      // Op.gte/Op.lt are Symbol keys — Object.keys() can't see them, so it always reported
      // an empty range and this filter never got applied. Reflect.ownKeys() sees both.
      if (Reflect.ownKeys(range).length > 0) {
        whereConditions.dateReceivedByOSAH = range;
      }
    } else if (hasSingleDate) {
      const dayStart = new Date(dateReceived);
      const dayEnd = new Date(dateReceived);
      dayEnd.setDate(dayEnd.getDate() + 1);

      whereConditions.dateReceivedByOSAH = {
        [Op.gte]: dayStart,
        [Op.lt]: dayEnd,
      };
    } else if (!hasNonSearchFilters) {
      // No explicit filters selected -> default last 30 days window
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      whereConditions.dateReceivedByOSAH = {
        [Op.gte]: thirtyDaysAgo,
      };
    }

    // Search across multiple fields (casetype, agency ref #, formatted date, case name)
    const where = { ...whereConditions };
    if (searchValue) {
      const searchConditions = [
        { caseType: { [Op.like]: `%${searchValue}%` } },
        { agencyRefNumber: { [Op.like]: `%${searchValue}%` } },
        Sequelize.where(
          Sequelize.fn('DATE_FORMAT', Sequelize.col('dateReceivedByOSAH'), '%m-%d-%Y'),
          { [Op.like]: `%${searchValue}%` },
        ),
        { caseName: { [Op.like]: `%${searchValue}%` } },
      ];

      where[Op.and] = [...(where[Op.and] || []), { [Op.or]: searchConditions }];
    }

    // Fetch data
    const { limit: parsedLimit, offset: parsedOffset } = parsePagination(limit, offset);
    const { count, rows } = await Form1Docket.findAndCountAll({
      where,
      limit: parsedLimit,
      offset: parsedOffset,
      order: [[orderby, ascdesc.toUpperCase()]],
      attributes: [
        'form1Id',
        'refAgency',
        'caseType',
        'dateReceivedByOSAH',
        'agencyRefNumber',
        'docketNumber',
        'status',
        'caseName',
      ],
    });

    return res.status(200).json({
      success: true,
      data: rows,
      count,
      page: Math.floor(parsedOffset / parsedLimit) + 1,
    });
  } catch (error) {
    logger.error('[ReviewForm1] getUnassignedForm1s error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned Form 1s',
      error: error.message,
    });
  }
};

/** Get all filter options (agencies, case types, statuses, clerks). */
export const getFilterOptions = async (req, res) => {
  try {
    const filterOptions = await getAllFilterOptions();

    return res.status(200).json({
      success: true,
      data: filterOptions,
    });
  } catch (error) {
    logger.error('[ReviewForm1] getFilterOptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch filter options',
      error: error.message,
    });
  }
};

/** Get Case Types for the selected agencies (Unassigned Form 1s filter, body: { agency }). */
export const getCaseTypesForAgencies = async (req, res) => {
	  try {
	    const { agency } = req.body || {};

	    const caseTypes = await getCaseTypesByAgencies(agency || []);

	    return res.status(200).json({
	      success: true,
	      data: caseTypes,
	    });
	  } catch (error) {
	    logger.error('[ReviewForm1] getCaseTypesForAgencies error:', error);
	    return res.status(500).json({
	      success: false,
	      message: 'Failed to fetch case types for selected agencies',
	      error: error.message,
	    });
	  }
};

/** Get full details for a single Form 1 record by form1Id. */
export const getForm1Detail = async (req, res) => {
  try {
    const { form1Id } = req.params;
    const id = parseInt(form1Id, 10);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Form 1 id',
      });
    }

    const reviewData = await getForm1ReviewData(id);

    if (!reviewData) {
      return res.status(404).json({
        success: false,
        message: 'Form 1 record not found',
      });
    }

    if (!canViewForm1(req, reviewData.docketinfo)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this Form 1',
      });
    }

    return res.status(200).json({
      success: true,
      data: reviewData,
    });
  } catch (error) {
    logger.error('[ReviewForm1] getForm1Detail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Form 1 details',
      error: error.message,
    });
  }
};

/** Bulk assign a clerk to Form 1s. Accepts { form1Ids } or legacy { docketArr }, updates docketClerk. */
export const assignClerkToForm1s = async (req, res) => {
	  try {
	    const { form1Ids, docketArr, clerk } = req.body || {};

	    // Support both the new `form1Ids` and the legacy `docketArr` key
	    const rawIds =
	      Array.isArray(form1Ids) && form1Ids.length > 0
	        ? form1Ids
	        : docketArr;

	    const normalizedIds = Array.isArray(rawIds)
	      ? rawIds
	          .map((id) => Number(id))
	          .filter((id) => !Number.isNaN(id))
	      : [];

	    if (!Array.isArray(normalizedIds) || normalizedIds.length === 0) {
	      return res.status(400).json({
	        success: false,
	        message: 'No Form 1 records selected for assignment',
	      });
	    }

	    if (!clerk || typeof clerk !== 'string' || !clerk.trim()) {
	      return res.status(400).json({
	        success: false,
	        message: 'Clerk is required for assignment',
	      });
	    }

	    const affectedCount = await updateForm1ClerkAssignments(
	      normalizedIds,
	      clerk.trim(),
	    );

	    return res.status(200).json({
	      success: true,
	      message: 'Clerk assigned successfully',
	      data: {
	        updated: affectedCount,
	        form1Ids: normalizedIds,
	      },
	    });
	  } catch (error) {
	    logger.error('[ReviewForm1] assignClerkToForm1s error:', error);
	    return res.status(500).json({
	      success: false,
	      message: 'Failed to assign clerk to Form 1s',
	      error: error.message,
	    });
	  }
	};
