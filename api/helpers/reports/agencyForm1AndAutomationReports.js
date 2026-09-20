import { Op, fn, col, literal } from "sequelize";
import {
  Docket,
  JudgeAssistantClerk,
  DecisionAutomationReport,
  Form1Docket
} from "../../models/index.js";
import DocumentTypesForAutomation from "../../models/DocumentTypesForAutomation.js";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import {
  parseDateFilter,
  formatDate,
  addCommonFilterConditions,
  buildDecisionAutomationQuery
} from "./shared/reportUtils.js";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Helper to add a simple IN filter to the whereConditions array.
 * Extracting this logic keeps the main reporting helpers less complex
 * while preserving the original filtering behavior.
 */
const addArrayInFilter = (whereConditions, values, fieldName) => {
	if (Array.isArray(values) && values.length) {
		whereConditions.push({
			[fieldName]: { [Op.in]: values },
		});
	}
};

/**
 * Agency Form 1 Approval Reports
 * Fetches approved Form 1 cases with filters, pagination, and sorting
 * @param {Object} param - Filter parameters including pagination and sorting
 * @returns {Object} Object containing results array and pagination metadata
 */
export async function agencyForm1ApprovalReports(param) {
  try {
    const whereConditions = [];

    // Extract pagination and sorting parameters
    const page = param.page || 0;
    const limit = param.limit || 20;
    const sortBy = param.sortBy || 'caseId';
    const sortOrder = param.sortOrder || 'DESC';
    const exportMode = param.exportMode || false;

    // Clerk filter - Use literal since clerkForm1 uses custom ON clause
    if (Array.isArray(param.clerk) && param.clerk.length) {
      // Validate that all clerk IDs are integers for extra safety
      const validClerkIds = param.clerk
        .map(id => Number.parseInt(id, 10))
        .filter(id => !Number.isNaN(id) && id > 0);

      if (validClerkIds.length) {
        const clerkIds = validClerkIds.map(id => mysqlSequelize.escape(id)).join(',');
        whereConditions.push(
          literal(`\`clerkForm1\`.\`user_id\` IN (${clerkIds})`)
        );
      }
    }

	    // Simple array filters (county, agency, case types, judge, assistants, status)
	    addArrayInFilter(whereConditions, param.county, "county");
	    addArrayInFilter(whereConditions, param.agency, "refAgency");
	    addArrayInFilter(whereConditions, param.casetypes, "caseType");
	    addArrayInFilter(whereConditions, param.judge, "judge");
	    addArrayInFilter(whereConditions, param.judgeassistant, "judgeAssistant");
	    addArrayInFilter(whereConditions, param.staffattorney, "staffAttorney");
	    addArrayInFilter(whereConditions, param.status, "status");

    // Date received from filter - Use DATE_FORMAT for proper comparison (matching PHP logic)
    const dateReceivedFrom = parseDateFilter(param.dateReceivedfrom);
    if (dateReceivedFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`Docket\`.\`datereceivedbyOSAH\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(dateReceivedFrom)}`)
      );
    }

    // Date received to filter
    const dateReceivedTo = parseDateFilter(param.dateReceivedto);
    if (dateReceivedTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`Docket\`.\`datereceivedbyOSAH\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(dateReceivedTo)}`)
      );
    }

    // Hearing date from filter
    const hearingDateFrom = parseDateFilter(param.hearingdatefrom);
    if (hearingDateFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`Docket\`.\`hearingDate\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(hearingDateFrom)}`)
      );
    }

    // Hearing date to filter
    const hearingDateTo = parseDateFilter(param.hearingdateto);
    if (hearingDateTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`Docket\`.\`hearingDate\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(hearingDateTo)}`)
      );
    }

    // Map frontend sortBy to database column names
    const sortByMap = {
      'caseId': 'caseId',
      'caseName': 'caseName',
      'refAgency': 'refAgency',
      'caseType': 'caseType',
      'dateReceived': 'dateReceivedByOSAH',
      'hearingDate': 'hearingDate',
      'county': 'county',
      'hearingSite': 'hearingSite',
      'status': 'status',
      'judge': 'judge',
      'judgeAssistant': 'judgeAssistant',
      'staffAttorney': 'staffAttorney',
      'docketClerk': 'docketClerk',
    };

    const dbSortColumn = sortByMap[sortBy] || 'caseId';


    // Build query options
    const queryOptions = {
      attributes: [
        "caseId",
        "caseName",
        "refAgency",
        "caseType",
        [fn("DATE_FORMAT", col("Docket.dateReceivedByOSAH"), "%m-%d-%Y"), "dateReceivedByOSAH"],
        [fn("DATE_FORMAT", col("Docket.hearingDate"), "%m-%d-%Y"), "hearingDate"],
        "county",
        "status",
        "hearingSite",
        "judge",
        "judgeAssistant",
        "staffAttorney",
        "docketClerk",
      ],
      include: [
        {
          model: Form1Docket,
          as: "form1docket",
          required: true,
          attributes: [],
          where: {
            status: 'approved'
          }
        },
        {
          model: JudgeAssistantClerk,
          as: "clerkForm1",
          required: true,
          attributes: ["firstName", "lastName"],
          on: literal("SUBSTRING_INDEX(`clerkForm1`.`email`, '@', 1) = `Docket`.`docketClerk`")
        },
      ],
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      order: [
        [dbSortColumn, sortOrder]
      ],
      distinct: true, // Required for accurate count with joins
      subQuery: false, // Prevent N+1 queries
    };

    // Add pagination only if not in export mode
    if (!exportMode) {
      queryOptions.limit = limit;
      queryOptions.offset = page * limit;
    }

    // Use findAndCountAll for better performance (single query for count + data)
    const { count, rows } = await Docket.findAndCountAll(queryOptions);

    // Transform results to camelCase properties for frontend
    const transformedResults = rows.map(result => {
      const clerk = result.clerkForm1;

      return {
        caseId: result.caseId,
        caseName: result.caseName,
        refAgency: result.refAgency,
        caseType: result.caseType,
        dateReceived: result.dateReceivedByOSAH,
        hearingDate: result.hearingDate,
        county: result.county,
        status: result.status,
        hearingSite: result.hearingSite,
        judge: result.judge,
        judgeAssistant: result.judgeAssistant,
        staffAttorney: result.staffAttorney,
        docketClerk: clerk ? `${clerk.lastName} ${clerk.firstName}` : '',
      };
    });

    // Return results with pagination metadata (if not in export mode)
    if (exportMode) {
      return transformedResults;
    }

    return {
      results: transformedResults,
      pagination: {
        total: count,
        page: page,
        limit: limit,
        totalPages: Math.ceil(count / limit),
      }
    };
  } catch (error) {
    logger.error("Error in agencyForm1ApprovalReports helper:", error);
    throw error;
  }
}

/**
 * Decision Automation Reports
 * Fetches automation reports for decisions, continuances, and NOH with pagination and sorting
 * @param {Object} param - Filter parameters including pagination and sorting
 * @returns {Object|Array} Object with results and pagination (normal mode) or Array (export mode)
 */
export async function decisionAutomationReports(param) {
  try {
    const whereConditions = [];

    // Extract pagination and sorting parameters
    const page = param.page || 0;
    const limit = param.limit || 20;
    const sortBy = param.sortBy || 'decisionAutomationDate';
    const sortOrder = param.sortOrder || 'DESC';
    const exportMode = param.exportMode || false;

    // Automation flag filter (decision, continuance, or noh) - Use Sequelize operator
    if (param.automation_flag) {
      whereConditions.push({
        automationFlag: param.automation_flag
      });
    }

    // Case type filter - Use nested include syntax
    if (Array.isArray(param.casetypes) && param.casetypes.length) {
      whereConditions.push({
        '$casetype.caseCode$': { [Op.in]: param.casetypes }
      });
    }

    // Add common filter conditions (judge, cma, agency)
    addCommonFilterConditions(whereConditions, param);

    // Automation sub type filter
    if (Array.isArray(param.automation_sub_type) && param.automation_sub_type.length) {
      whereConditions.push({
        automationSubType: { [Op.in]: param.automation_sub_type }
      });
    }

    // Date received from filter - Use DATE_FORMAT for proper comparison (matching PHP logic)
    const dateReceivedFrom = parseDateFilter(param.dateReceivedfrom);
    if (dateReceivedFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`date_received\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(dateReceivedFrom)}`)
      );
    }

    // Date received to filter
    const dateReceivedTo = parseDateFilter(param.dateReceivedto);
    if (dateReceivedTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`date_received\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(dateReceivedTo)}`)
      );
    }


    // Automation date from filter
    const automationDateFrom = parseDateFilter(param.automationdatefrom);
    if (automationDateFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`decision_automation_date\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(automationDateFrom)}`)
      );
    }

    // Automation date to filter
    const automationDateTo = parseDateFilter(param.automationdateto);
    if (automationDateTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`decision_automation_date\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(automationDateTo)}`)
      );
    }

    // Hearing date from filter
    const hearingDateFrom = parseDateFilter(param.hearingdatefrom);
    if (hearingDateFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`hearing_date\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(hearingDateFrom)}`)
      );
    }

    // Hearing date to filter
    const hearingDateTo = parseDateFilter(param.hearingdateto);
    if (hearingDateTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`hearing_date\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(hearingDateTo)}`)
      );
    }

    const queryConfig = buildDecisionAutomationQuery([
      "id", // ✅ Include unique ID for DataGrid row identification
      "caseId",
      "caseName",
      "cma",
      "judge",
      "automationSubType",
      "dateReceived",
      "hearingDate",
      "decisionAutomationDate",
    ]);

    // Map frontend sortBy to database column names
    const sortFieldMap = {
      caseId: ['caseId', sortOrder],
      caseName: ['caseName', sortOrder],
      agencyCode: [col('agn.agencyCode'), sortOrder],
      caseCode: [col('casetype.caseCode'), sortOrder],
      dateReceived: ['dateReceived', sortOrder],
      hearingDate: ['hearingDate', sortOrder],
      decisionAutomationDate: ['decisionAutomationDate', sortOrder],
      automationSubType: ['automationSubType', sortOrder],
      judge: ['judge', sortOrder],
      cma: ['cma', sortOrder],
    };

    const orderBy = sortFieldMap[sortBy] || ['decisionAutomationDate', 'DESC'];

    // Build query options
    const queryOptions = {
      ...queryConfig,
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      order: [orderBy],
    };

    // Add pagination only if not in export mode
    if (!exportMode) {
      const offset = page * limit;
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    // Use findAndCountAll for pagination support
    const { count, rows } = await DecisionAutomationReport.findAndCountAll(queryOptions);

    // Transform results to camelCase format with formatted dates
    const results = rows.map(result => ({
      id: result.id, // ✅ Include unique ID for DataGrid row identification
      caseId: result.caseId,
      caseName: result.caseName,
      cma: result.cma,
      judge: result.judge,
      automationSubType: result.automationSubType,
      dateReceived: result.dateReceived ? formatDate(result.dateReceived) : null,
      hearingDate: result.hearingDate ? formatDate(result.hearingDate): null,
      decisionAutomationDate: result.decisionAutomationDate ? formatDate(result.decisionAutomationDate) : null,
      agencyCode: result.agn?.agencyCode,
      caseCode: result.casetype?.caseCode,
    }));

    // Return different format based on export mode
    if (exportMode) {
      return results; // Export mode: return array only
    }

    // Normal mode: return object with pagination
    const totalPages = Math.ceil(count / limit);
    return {
      results,
      pagination: {
        total: count,
        page,
        limit,
        totalPages,
      },
    };
  } catch (error) {
    logger.error("Error in decisionAutomationReports helper:", error);
    throw error;
  }
}

/**
 * Get document types for automation (Decision, Continuance, NOH)
 * @returns {Object} Object containing decisionType, continuanceType, and nohType arrays
 */
export async function getDocumentTypesForAutomation() {
  try {
    // Fetch all document types for automation
    const resultRaw = await DocumentTypesForAutomation.findAll({
      logging: false,
    });

    // Group by automationType (1=Decision, 2=Continuance, 3=NOH)
    const decisionType = [];
    const continuanceType = [];
    const nohType = [];

    resultRaw.forEach(item => {
      const typeObj = { type: item.type };

      // automationType is stored as '1', '2', '3' in database
      if (item.automationType === '1') {
        decisionType.push(typeObj);
      } else if (item.automationType === '2') {
        continuanceType.push(typeObj);
      } else if (item.automationType === '3') {
        nohType.push(typeObj);
      }
    });

    return {
      decisionType,
      continuanceType,
      nohType,
    };
  } catch (error) {
    logger.error("Error in getDocumentTypesForAutomation helper:", error);
    throw error;
  }
}

