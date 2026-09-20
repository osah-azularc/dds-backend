// Lookup/dropdown data shared by the calendar management screen (circuits,
// casetype groups, casetypes, judges, CMAs). Converted from the PHP
// getCalendarCommonData bundle of helper functions.
import { Sequelize, Op } from "sequelize";
import CasteTypeGroups from "../../../../models/admin/casteTypeGroupsModel.js";
import V2_5_Circuit from "../../../../models/admin/v2_5_circuitModel.js";
import caseTypes from "../../../../models/admin/caseTypesModel.js";
import UnifiedCases from "../../../../models/admin/unified_casesModel.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { logger } from "../../../../../config/winstonLogger.js";

/**
 * Get repeated case types across multiple agencies
 * This function finds case codes that are used by more than one agency
 * Equivalent to PHP getRepeatedCasetypes function
 */
const getRepeatedCasetypes = async () => {
  try {
    const agencyCasetypeList = [];

    const repeatedCasetypes = await caseTypes.findAll({
      attributes: [
        "CaseCode",
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.fn("DISTINCT", Sequelize.col("AgencyID")),
          ),
          "distinct_refagency",
        ],
      ],
      group: ["CaseCode"],
      having: Sequelize.where(
        Sequelize.fn(
          "COUNT",
          Sequelize.fn("DISTINCT", Sequelize.col("AgencyID")),
        ),
        ">",
        1,
      ),
      raw: true,
    });

    repeatedCasetypes.forEach((data) => {
      if (!agencyCasetypeList.includes(data.CaseCode)) {
        agencyCasetypeList.push(data.CaseCode);
      }
    });

    return agencyCasetypeList;
  } catch (error) {
    logger.error(`[getRepeatedCasetypes]`, error);
    return [];
  }
};

/**
 * Get case types grouped by case group ID
 * Equivalent to PHP casetypeWithCaseGroup function
 */
const getCasetypeWithCaseGroup = async () => {
  try {
    const casetypes = await UnifiedCases.findAll({
      attributes: ["casetype_group_id", "casetypeid"],
      raw: true,
    });

    const casetypeWithCaseGroupList = {};

    casetypes.forEach((c) => {
      const caseGroupId = c.casetype_group_id;
      const caseTypeId = c.casetypeid;

      if (!casetypeWithCaseGroupList[caseGroupId]) {
        casetypeWithCaseGroupList[caseGroupId] = [];
      }

      casetypeWithCaseGroupList[caseGroupId].push(caseTypeId);
    });

    return casetypeWithCaseGroupList;
  } catch (error) {
    logger.error(`[getCasetypeWithCaseGroup]`, error);
    return {};
  }
};

/**
 * Get active, non-test judge_assistant_clerk users of a given type, formatted
 * for frontend dropdown consumption.
 * @param {string} userType - 'judge' or 'cma'
 */
const getActiveStaffByType = async (userType) => {
  const staff = await JudgeAssistantClerk.findAll({
    attributes: ["userId", "firstName", "lastName"],
    where: {
      isActive: "1",
      userType,
      firstName: { [Op.ne]: "Test" },
    },
    order: [
      ["lastName", "ASC"],
      ["firstName", "ASC"],
    ],
    raw: true,
  });

  return staff.map((person) => ({
    id: person.userId,
    name: `${person.lastName}, ${person.firstName}`,
    firstName: person.firstName,
    lastName: person.lastName,
  }));
};

export const getCalendarCommonData = async () => {
  const v2 = await V2_5_Circuit.findAll({
    attributes: ["id", "name"],
    order: [["name", "ASC"]],
  });

  const casetypegroups = await CasteTypeGroups.findAll({
    attributes: ["id", "casetypegroup"],
    order: [["casetypegroup", "ASC"]],
  });

  const repeatedCasetypes = await getRepeatedCasetypes();

  const allCasetypes = await caseTypes.findAll({
    attributes: ["Casetypeid", "Agencycode", "CaseCode", "Casefiletype"],
    // is_active (not the legacy/unsynced Active column - see caseTypeController.js's
    // toLegacyCaseTypeRow comment) is what the Case Type admin screen's Active
    // toggle actually writes, so it's the source of truth for "active".
    where: { Casetypeid: { [Op.ne]: 0 }, is_active: "1" },
    raw: true,
  });

  // Raw fields only - no display title here. Different screens need
  // different casetype label formats (e.g. calendarManagementTab's
  // "Agency-CaseCode" dropdown vs. other consumers), so formatting is left to
  // the frontend; repeatedCasetypes is returned below so callers can decide
  // when to disambiguate a CaseCode shared by multiple agencies.
  const formattedCasetypes = allCasetypes
    .map((casetype) => ({
      id: casetype.Casetypeid,
      agencycode: casetype.Agencycode,
      casecode: casetype.CaseCode,
      casefiletype: casetype.Casefiletype,
      casetypeId: casetype.Casetypeid,
    }))
    // numeric: true makes "2" sort before "10" (plain localeCompare would put
    // "10" first, comparing char-by-char) and puts digit-led casecodes ahead
    // of letter-led ones, per the dropdown's requested "numbers first" order.
    // The same CaseCode can recur across multiple agencies (e.g. "123" under
    // agency "2333", "CMO", "DFCS-M", "DCH-HFR" all at once) - casecode alone
    // ties in that case, leaving the DB's arbitrary row order in charge, so
    // agencycode breaks the tie for a fully deterministic order.
    .sort((a, b) => {
      const casecodeCompare = (a.casecode || "").localeCompare(b.casecode || "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (casecodeCompare !== 0) return casecodeCompare;
      return (a.agencycode || "").localeCompare(b.agencycode || "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

  const casetypeWithCaseGroupData = await getCasetypeWithCaseGroup();
  const formattedJudges = await getActiveStaffByType("judge");
  const formattedCMAs = await getActiveStaffByType("cma");

  return {
    circuit: v2,
    casetypeGroup: casetypegroups,
    allCasetypes: formattedCasetypes,
    repeatedCasetypes,
    casetypeWithCaseGroup: casetypeWithCaseGroupData,
    judges: formattedJudges,
    cmas: formattedCMAs,
  };
};
