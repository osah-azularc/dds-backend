import { mysqlSequelize } from "../../connections/seqDB.js";
import { logger } from "../../config/winstonLogger.js";

// Controller function for searchDocketResult
const searchDocketResult = async (req, res) => {
  try {
    const payload = req.body;

    if (!payload?.tableSettings) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const condition = JSON.parse(payload.tableSettings).payload;
    const agencyPlatformId = condition.userSessionData.agency_platform_id;

    // Fetch all case types for the logged-in agency
    const agencyCaseTypesQuery = `
        SELECT casetype FROM agency_platform_casetype WHERE agency_platform_id = :agencyPlatformId
      `;
    const agencyCaseTypes = await mysqlSequelize.query(agencyCaseTypesQuery, {
      replacements: { agencyPlatformId },
      type: mysqlSequelize.QueryTypes.SELECT,
    });

    const allCaseTypesLoggedinAgency = agencyCaseTypes.map(
      (item) => item.casetype,
    );

    // Fetch case codes from the `casetypes` table
    const caseTypesQuery = `
        SELECT CaseCode FROM casetypes WHERE Casetypeid IN (:allCaseTypesLoggedinAgency)
      `;
    const caseTypes = await mysqlSequelize.query(caseTypesQuery, {
      replacements: { allCaseTypesLoggedinAgency },
      type: mysqlSequelize.QueryTypes.SELECT,
    });

    const finalCaseTypeMasterCondition = caseTypes.map((item) => item.CaseCode);

    // Build the master condition
    let masterCondition = `doc.telv_o_five = '1'`; // Default condition

    if (finalCaseTypeMasterCondition.length > 0) {
      masterCondition += ` AND doc.casetype IN ('${finalCaseTypeMasterCondition.join("','")}')`;
    }

    if (condition.refagency && Array.isArray(condition.refagency)) {
      const refagencyCodes = condition.refagency.map(
        (agency) => agency.Agencycode,
      );
      masterCondition += ` AND doc.refagency IN ('${refagencyCodes.join("','")}')`;
    }

    if (condition.casetype && Array.isArray(condition.casetype)) {
      const caseTypeCodes = condition.casetype.map((type) => type.CaseCode);
      masterCondition += ` AND doc.casetype IN ('${caseTypeCodes.join("','")}')`;
    }

    if (condition.status) {
      if (condition.status === "NA") {
        masterCondition += ` AND doc.status != 'Closed'`;
      } else if (condition.status === "All") {
        masterCondition += ` AND doc.status != ''`;
      } else {
        masterCondition += ` AND doc.status = '${condition.status}'`;
      }
    }

    if (condition.hearingdate_From) {
      masterCondition += ` AND doc.hearingdate >= '${condition.hearingdate_From}'`;
    }
    if (condition.hearingdate_To) {
      masterCondition += ` AND doc.hearingdate <= '${condition.hearingdate_To}'`;
    }

    if (condition.datereceivedbyOSAH_From) {
      masterCondition += ` AND doc.datereceivedbyOSAH >= '${condition.datereceivedbyOSAH_From}'`;
    }
    if (condition.datereceivedbyOSAH_To) {
      masterCondition += ` AND doc.datereceivedbyOSAH <= '${condition.datereceivedbyOSAH_To}'`;
    }

    if (condition.judge) {
      masterCondition += ` AND doc.judge = '${condition.judge}'`;
    }

    if (condition.judgeassistant) {
      masterCondition += ` AND doc.judgeassistant = '${condition.judgeassistant}'`;
    }

    if (condition.hearingsite) {
      masterCondition += ` AND doc.hearingsite = '${condition.hearingsite}'`;
    }

    // Pagination and sorting
    const offset = payload.offset || 0;
    const limit = payload.limit || 10;
    const orderBy = payload.sortName || "datereceivedbyOSAH";
    const order = payload.sortOrder === "desc" ? "DESC" : "ASC";

    // Raw SQL query to fetch data from the `docket` table
    const docketQuery = `
        SELECT 
          doc.caseid,
          doc.docketnumber,
          doc.status,
          doc.datereceivedbyOSAH,
          doc.refagency,
          doc.casetype,
          doc.county,
          doc.agencyrefnumber,
          doc.hearingmode,
          doc.hearingsite,
          doc.hearingdate,
          doc.hearingtime,
          doc.judge,
          doc.judgeassistant,
          doc.casename
        FROM docket AS doc
        WHERE ${masterCondition}
        ORDER BY ${orderBy} ${order}
        LIMIT :limit OFFSET :offset
      `;

    const dockets = await mysqlSequelize.query(docketQuery, {
      replacements: { limit, offset },
      type: mysqlSequelize.QueryTypes.SELECT,
    });

    // Count total records
    const countQuery = `
        SELECT COUNT(*) AS total
        FROM docket AS doc
        WHERE ${masterCondition}
      `;
    const totalCountResult = await mysqlSequelize.query(countQuery, {
      type: mysqlSequelize.QueryTypes.SELECT,
    });
    const totalCount = totalCountResult[0].total;

    // Return the results
    return res.json({
      searchSuccess: true,
      dataTotalSize: totalCount,
      data: dockets,
    });
  } catch (error) {
    logger.error("Error in searchDocketResult:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
    });
  }
};

export { searchDocketResult };
