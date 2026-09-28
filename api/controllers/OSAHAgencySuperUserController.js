import { Op } from "sequelize";
import { logger } from "../../config/winstonLogger.js";
import AgencyPlatformCasetype from "../models/AgencyPlatformCasetype.js";
import Casetypes from "../models/Casetypes.js";
import Docket from "../models/Docket.js";

// Builds the AND-chained where clause for the docket table, mirroring the
// dynamic `masterCondition` string the raw-SQL version used to assemble.
const buildDocketWhere = (condition, finalCaseTypeMasterCondition) => {
  const andConditions = [{ telvOFive: "1" }];

  if (finalCaseTypeMasterCondition.length > 0) {
    andConditions.push({
      caseType: { [Op.in]: finalCaseTypeMasterCondition },
    });
  }

  if (condition.refagency && Array.isArray(condition.refagency)) {
    const refagencyCodes = condition.refagency.map(
      (agency) => agency.Agencycode,
    );
    andConditions.push({ refAgency: { [Op.in]: refagencyCodes } });
  }

  if (condition.casetype && Array.isArray(condition.casetype)) {
    const caseTypeCodes = condition.casetype.map((type) => type.CaseCode);
    andConditions.push({ caseType: { [Op.in]: caseTypeCodes } });
  }

  if (condition.status) {
    if (condition.status === "NA") {
      andConditions.push({ status: { [Op.ne]: "Closed" } });
    } else if (condition.status === "All") {
      andConditions.push({ status: { [Op.ne]: "" } });
    } else {
      andConditions.push({ status: condition.status });
    }
  }

  if (condition.hearingdate_From) {
    andConditions.push({
      hearingDate: { [Op.gte]: condition.hearingdate_From },
    });
  }
  if (condition.hearingdate_To) {
    andConditions.push({
      hearingDate: { [Op.lte]: condition.hearingdate_To },
    });
  }

  if (condition.datereceivedbyOSAH_From) {
    andConditions.push({
      dateReceivedByOSAH: { [Op.gte]: condition.datereceivedbyOSAH_From },
    });
  }
  if (condition.datereceivedbyOSAH_To) {
    andConditions.push({
      dateReceivedByOSAH: { [Op.lte]: condition.datereceivedbyOSAH_To },
    });
  }

  if (condition.judge) {
    andConditions.push({ judge: condition.judge });
  }

  if (condition.judgeassistant) {
    andConditions.push({ judgeAssistant: condition.judgeassistant });
  }

  if (condition.hearingsite) {
    andConditions.push({ hearingSite: condition.hearingsite });
  }

  return { [Op.and]: andConditions };
};

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
    const agencyCaseTypes = await AgencyPlatformCasetype.findAll({
      where: { agencyPlatformId },
      attributes: ["caseTypeId"],
      raw: true,
    });

    const allCaseTypesLoggedinAgency = agencyCaseTypes.map(
      (item) => item.caseTypeId,
    );

    // Fetch case codes from the `casetypes` table
    const caseTypes = await Casetypes.findAll({
      where: { caseTypeId: { [Op.in]: allCaseTypesLoggedinAgency } },
      attributes: ["caseCode"],
      raw: true,
    });

    const finalCaseTypeMasterCondition = caseTypes.map(
      (item) => item.caseCode,
    );

    const docketWhere = buildDocketWhere(
      condition,
      finalCaseTypeMasterCondition,
    );

    // Pagination and sorting
    const offset = payload.offset || 0;
    const limit = payload.limit || 10;
    const orderBy = payload.sortName || "datereceivedbyOSAH";
    const order = payload.sortOrder === "desc" ? "DESC" : "ASC";

    // Fetch data from the `docket` table, keeping the original raw-SQL
    // column names in the response shape via attribute aliases.
    const dockets = await Docket.findAll({
      where: docketWhere,
      attributes: [
        ["caseId", "caseid"],
        ["docketNumber", "docketnumber"],
        ["status", "status"],
        ["dateReceivedByOSAH", "datereceivedbyOSAH"],
        ["refAgency", "refagency"],
        ["caseType", "casetype"],
        ["county", "county"],
        ["agencyRefNumber", "agencyrefnumber"],
        ["hearingMode", "hearingmode"],
        ["hearingSite", "hearingsite"],
        ["hearingDate", "hearingdate"],
        ["hearingTime", "hearingtime"],
        ["judge", "judge"],
        ["judgeAssistant", "judgeassistant"],
        ["caseName", "casename"],
      ],
      order: [[orderBy, order]],
      limit,
      offset,
      raw: true,
    });

    // Count total records
    const totalCount = await Docket.count({ where: docketWhere });

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
