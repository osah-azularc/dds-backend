import { Op } from "sequelize";
import Docket from "../models/Docket.js";
import TypeOfContact from "../models/TypeOfContact.js";
import PeopleDetails from "../models/PeopleDetails.js";
import AgencyCaseworkerByCase from "../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../models/AttorneyByCase.js";
import MinorDetails from "../models/MinorDetails.js";
import { logger } from "../../config/winstonLogger.js";

const TABLE_MODEL_MAP = {
	  peopledetails: PeopleDetails,
	  agencycaseworkerbycase: AgencyCaseworkerByCase,
	  attorneybycase: AttorneyByCase,
	  minordetails: MinorDetails,
};

const buildDocketQueryOptions = (additionalCondition, whereConditions, include = []) => {
	  const orderField = additionalCondition.orderby || 'dateReceivedByOSAH';
	  const orderDirection = additionalCondition.order === 1 ? 'DESC' : 'ASC';
	  const limit = additionalCondition.length || 50;
	  const offset = additionalCondition.start || 0;

	  return {
	    attributes: [
	      'caseId', 'caseName', 'refAgency', 'caseType',
	      'dateReceivedByOSAH', 'dateRequested', 'hearingDate', 'hearingTime',
	      'county', 'hearingSite', 'judge', 'status', 'agencyRefNumber',
	    ],
	    where: { [Op.and]: whereConditions },
	    include,
	    order: [[orderField, orderDirection]],
	    limit,
	    offset,
	    distinct: true,
	    col: 'caseId',
	  };
};

const sendEmptyResult = (res) => res.status(200).json({
	  success: true,
	  message: 'No results found',
	  data: [],
	  total: 0,
	  error: null,
});

const mapDocketRowsToResponse = (result) => ({
	  success: true,
	  message: result.count > 0 ? 'Data fetched successfully' : 'No results found',
	  data: result.rows.map((row) => row.toJSON()),
	  total: result.count,
	  error: null,
});

const collectCaseIdsByNameOnly = async (fname, lname) => {
	  const nameWhere = {};
	  if (fname) nameWhere.firstName = fname;
	  if (lname) nameWhere.lastName = lname;

	  const [peopleRows, agencyRows, attorneyRows, minorRows] = await Promise.all([
	    PeopleDetails.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
	    AgencyCaseworkerByCase.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
	    AttorneyByCase.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
	    MinorDetails.findAll({ attributes: ['caseId'], where: nameWhere, raw: true }),
	  ]);

	  const allRows = [...peopleRows, ...agencyRows, ...attorneyRows, ...minorRows];
	  return [...new Set(allRows.map((r) => r.caseId).filter((id) => id != null))];
};

const handleNameOnlySearch = async (additionalCondition, whereConditions, fname, lname, res) => {
	  const caseIds = await collectCaseIdsByNameOnly(fname, lname);
	  if (caseIds.length === 0) {
	    return sendEmptyResult(res);
	  }

	  whereConditions.push({ caseId: { [Op.in]: caseIds } });
	  const queryOptions = buildDocketQueryOptions(additionalCondition, whereConditions);
	  const result = await Docket.findAndCountAll(queryOptions);

	  return res.status(200).json(mapDocketRowsToResponse(result));
};

const resolveDetailModelAndWhere = async (contactType, fname, lname, res) => {
	  let DetailModel = PeopleDetails;
	  const detailWhere = {};

	  if (!contactType) {
	    return { DetailModel, detailWhere };
	  }

	  const contactTypeRecord = await TypeOfContact.findOne({
	    where: { partyContact: contactType },
	  });

	  if (!contactTypeRecord) {
	    res.status(400).json({
	      success: false,
	      message: 'Invalid contact type',
	      data: [],
	      total: 0,
	      error: null,
	    });
	    return { DetailModel: null, detailWhere: null };
	  }

	  DetailModel = TABLE_MODEL_MAP[contactTypeRecord.tableName] || PeopleDetails;

	  const isMinor = contactType === 'Minor/children';
	  if (!isMinor) {
	    detailWhere.typeOfContact = contactType;
	  }
	  if (fname) {
	    detailWhere.firstName = fname;
	  }
	  if (lname) {
	    detailWhere.lastName = lname;
	  }

	  return { DetailModel, detailWhere };
};

/**
 * Helper function to handle complex search with name/contact type joins
 * Uses Sequelize ORM with include for INNER JOIN (matches PHP implementation)
 * PHP Reference: OSAHAPIController.php lines 1035-1100 (INNER JOIN approach)
 * /**
 * @param {Object} condition - Search conditions
 * @param {Object} additionalCondition - Pagination params
 * @param {Array} whereConditions - Where clause array
 * @param {string} fname - First name
 * @param {string} lname - Last name
 * @param {string} contactType - Contact type
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Search results with pagination
 */
export async function handleComplexSearch(condition, additionalCondition, whereConditions, fname, lname, contactType, res) {
  try {
	    if (!contactType && (fname || lname)) {
	      // ── Name only, no contact type ────────────────────────────────────────
	      // PHP searchResultAction else-if(name_Flage==1) block
	      return handleNameOnlySearch(additionalCondition, whereConditions, fname, lname, res);
	    }

	    // ── Contact type with or without name — INNER JOIN approach ─────────────
	    const { DetailModel, detailWhere } = await resolveDetailModelAndWhere(contactType, fname, lname, res);
	    if (!DetailModel) {
	      // Invalid contact type already handled with response
	      return;
	    }

	    const include = [
	      {
	        model: DetailModel,
	        as: DetailModel.name.toLowerCase(),
	        attributes: [],
	        where: detailWhere,
	        required: true, // INNER JOIN
	      },
	    ];

	    const queryOptions = buildDocketQueryOptions(additionalCondition, whereConditions, include);
	    const result = await Docket.findAndCountAll({
	      ...queryOptions,
	      subQuery: false,
	    });

	    if (result.count === 0) {
	      return sendEmptyResult(res);
	    }

	    return res.status(200).json(mapDocketRowsToResponse(result));
  } catch (error) {
    logger.error('❌ Error in handleComplexSearch:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: [],
      total: 0,
      error: error.message,
    });
  }
}