import { Op, fn, col, literal } from "sequelize";
import {
  Docket,
  BulkDocReport,
  JudgeAssistantClerk,
  DecisionAutomationReport
} from "../../models/index.js";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import moment from "moment";
import {
  parseDateFilter,
  addCommonFilterConditions,
  buildDecisionAutomationQuery
} from "./shared/reportUtils.js";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Bulk Document Reports
 * Fetches bulk document generation reports with filters, pagination, and sorting
 * @param {Object} param - Filter parameters including pagination and sorting
 * @returns {Object|Array} Object with results and pagination (normal mode) or Array (export mode)
 */
export async function bulkdocReports(param) {
  try {
    const docketWhere = [];
    const bulkdocWhere = [];
    const page = param.page || 0;
    const limit = param.limit || 20;
    const sortBy = param.sortBy || 'caseId';
    const sortOrder = param.sortOrder || 'ASC';
    const exportMode = param.exportMode || false;

    // Agency
    if (param.refagency?.length) {
      docketWhere.push({ refAgency: { [Op.in]: param.refagency } });
    }

    // Case type
    if (param.casetype?.length) {
      docketWhere.push({ caseType: { [Op.in]: param.casetype } });
    }

    // Judge
    if (param.judge?.length) {
      docketWhere.push({ judge: { [Op.in]: param.judge } });
    }

    // CMA (judgeAssistant column in docket table)
    if (param.cma?.length) {
      docketWhere.push({ judgeAssistant: { [Op.in]: param.cma } });
    }

    // Date filters (BulkDocReport.created_date) - Use DATE_FORMAT for proper comparison (matching PHP logic)
    const dateGeneratedFrom = parseDateFilter(param.dateGeneratedFrom);
    if (dateGeneratedFrom) {
      bulkdocWhere.push(
        literal(`DATE_FORMAT(\`BulkDocReport\`.\`created_date\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(dateGeneratedFrom)}`)
      );
    }

    const dateGeneratedTo = parseDateFilter(param.dateGeneratedTo);
    if (dateGeneratedTo) {
      bulkdocWhere.push(
        literal(`DATE_FORMAT(\`BulkDocReport\`.\`created_date\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(dateGeneratedTo)}`)
      );
    }

    // Map frontend field names to database column paths
    const sortFieldMap = {
      caseId: ['caseId', sortOrder],
      caseName: [col('docket.caseName'), sortOrder],
      refAgency: [col('docket.refAgency'), sortOrder],
      caseType: [col('docket.caseType'), sortOrder],
      dateReceived: [col('docket.dateReceivedByOSAH'), sortOrder],
      hearingDate: [col('docket.hearingDate'), sortOrder],
      county: [col('docket.county'), sortOrder],
      hearingSite: [col('docket.hearingSite'), sortOrder],
      judge: [col('docket.judge'), sortOrder],
      judgeAssistant: [col('docket.judgeAssistant'), sortOrder],
    };

    const orderBy = sortFieldMap[sortBy] || ['caseId', 'ASC'];

    // Build query options
    const queryOptions = {
      attributes: [],
      where: bulkdocWhere.length ? { [Op.and]: bulkdocWhere } : undefined,
      include: [
        {
          model: Docket,
          as: "docket",
          required: true,
          attributes: [
            "caseId",
            "caseName",
            "refAgency",
            "caseType",
            "county",
            "status",
            "hearingSite",
            "judge",
            "judgeAssistant",
            [fn("DATE_FORMAT", col("docket.dateReceivedByOSAH"), "%m-%d-%Y"), "dateReceivedByOSAH"],
            [fn("DATE_FORMAT", col("docket.hearingDate"), "%m-%d-%Y"), "hearingDate"],
          ],
          where: docketWhere.length ? { [Op.and]: docketWhere } : undefined,
        },
        {
          model: JudgeAssistantClerk,
          as: "user",
          required: true,
          attributes: ["firstName", "lastName"],
        },
      ],
      order: [orderBy],
    };

    // Add pagination only if not in export mode
    if (!exportMode) {
      const offset = page * limit;
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    // Use findAndCountAll for pagination support
    const { count, rows } = await BulkDocReport.findAndCountAll(queryOptions);

    const results = rows.map(row => ({
      caseId: row.docket.caseId,
      caseName: row.docket.caseName,
      refAgency: row.docket.refAgency,
      caseType: row.docket.caseType,
      dateReceived: row.docket.dateReceivedByOSAH,
      hearingDate: row.docket.hearingDate,
      county: row.docket.county,
      status: row.docket.status,
      hearingSite: row.docket.hearingSite,
      judge: row.docket.judge,
      judgeAssistant: row.docket.judgeAssistant,
      clerk: `${row.user.lastName}, ${row.user.firstName}`,
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
    logger.error("bulkdocReports error:", error);
    throw error;
  }
}

/**
 * Bulk Designation Reports
 * Fetches bulk designation reports for decisions and continuances with pagination and sorting
 * @param {Object} param - Filter parameters including pagination and sorting
 * @returns {Object|Array} Object with results and pagination (normal mode) or Array (export mode)
 */
export async function bulkdesignationReports(param) {
  try {
    const whereConditions = [];

    // Extract pagination and sorting parameters
    const page = param.page || 0;
    const limit = param.limit || 20;
    const sortBy = param.sortBy || 'caseId';
    const sortOrder = param.sortOrder || 'ASC';
    const exportMode = param.exportMode || false;

	    // Static filters - Use Sequelize model property names (camelCase)
	    whereConditions.push(
	      {
	        automationFlag: { [Op.in]: ['decision', 'continuance'] }
	      },
	      {
	        bulkDesignationFlag: '1'
	      },
	    );

    // Case type filter - Use nested include syntax
    if (Array.isArray(param.casetype) && param.casetype.length) {
      whereConditions.push({
        '$casetype.caseCode$': { [Op.in]: param.casetype }
      });
    }

    // Add common filter conditions (judge, cma, agency)
    addCommonFilterConditions(whereConditions, param);

    // Date filters - Use DATE_FORMAT for proper comparison (matching PHP logic)
    const dateDesignatedFrom = parseDateFilter(param.dateDesignatedFrom);
    const dateDesignatedTo = parseDateFilter(param.dateDesignatedTo);

    if (dateDesignatedFrom) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`decision_automation_date\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(dateDesignatedFrom)}`)
      );
    }

    if (dateDesignatedTo) {
      whereConditions.push(
        literal(`DATE_FORMAT(\`DecisionAutomationReport\`.\`decision_automation_date\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(dateDesignatedTo)}`)
      );
    }

    const queryConfig = buildDecisionAutomationQuery([
      "caseId",
      "caseName",
      "dateReceived",
      "hearingDate",
      "decisionAutomationDate",
      "judge",
      "cma",
    ]);

    // Map frontend field names to database column names
    const sortFieldMap = {
      caseId: ['caseId', sortOrder],
      caseName: ['caseName', sortOrder],
      agencyCode: [col('agn.agencyCode'), sortOrder],
      caseCode: [col('casetype.caseCode'), sortOrder],
      dateReceived: ['dateReceived', sortOrder],
      hearingDate: ['hearingDate', sortOrder],
      decisionAutomationDate: ['decisionAutomationDate', sortOrder],
      judge: ['judge', sortOrder],
      cma: ['cma', sortOrder],
    };

    const orderBy = sortFieldMap[sortBy] || [['decisionAutomationDate', 'DESC']];

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

    // Return camelCase properties for frontend with formatted dates
    const results = rows.map(result => ({
      caseId: result.caseId,
      caseName: result.caseName,
      dateReceived: result.dateReceived ? moment(result.dateReceived).format("MM-DD-YYYY") : null,
      hearingDate: result.hearingDate ? moment(result.hearingDate).format("MM-DD-YYYY") : null,
      decisionAutomationDate: result.decisionAutomationDate ? moment(result.decisionAutomationDate).format("MM-DD-YYYY") : null,
      judge: result.judge,
      cma: result.cma,
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
    logger.error("Error in bulkdesignationReports helper:", error);
    throw error;
  }
}
