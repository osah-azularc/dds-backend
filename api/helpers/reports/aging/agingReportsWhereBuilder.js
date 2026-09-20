import { Op, literal } from "sequelize";
import { mysqlSequelize } from "../../../../connections/seqDB.js";
import moment from "moment";
import { buildCasetypeRestrictionConditions } from "../buildCasetypeRestrictionConditions.js";

const addStatusCondition = (whereConditions, stayed) => {
  if (stayed === '1') {
    whereConditions.push({ status: { [Op.ne]: 'closed' } });
  } else {
    whereConditions.push({ status: { [Op.notIn]: ['closed', 'stayed'] } });
  }
};

const addOpenCasesDateFilters = (whereConditions, condition) => {
  if (!condition) return;

  if (condition.dateReceivedFrom) {
    const fromDate = moment(condition.dateReceivedFrom, ["M-D-YYYY", "MM-DD-YYYY"], true);
    if (fromDate.isValid()) {
      whereConditions.push(
        literal(
          `DATE_FORMAT(\`Docket\`.\`datereceivedbyOSAH\`, '%Y-%m-%d') >= ${mysqlSequelize.escape(
            fromDate.format('YYYY-MM-DD'),
          )}`,
        ),
      );
    }
  }

  if (condition.dateReceivedTo) {
    const toDate = moment(condition.dateReceivedTo, ["M-D-YYYY", "MM-DD-YYYY"], true);
    if (toDate.isValid()) {
      whereConditions.push(
        literal(
          `DATE_FORMAT(\`Docket\`.\`datereceivedbyOSAH\`, '%Y-%m-%d') <= ${mysqlSequelize.escape(
            toDate.format('YYYY-MM-DD'),
          )}`,
        ),
      );
    }
  }
};

const addCaseTypeFilter = (whereConditions, casetypeList) => {
  if (!Array.isArray(casetypeList) || !casetypeList.length) return;

  const caseTypeConditions = casetypeList.map((ct) => {
    if (ct.includes('||')) {
      const [agency, caseType] = ct.split('||');
      return {
        [Op.and]: [
          { refAgency: agency },
          { caseType },
        ],
      };
    }
    return { caseType: ct };
  });

  whereConditions.push({ [Op.or]: caseTypeConditions });
};

const addDetailsViewFilters = (whereConditions, detailsView) => {
  if (!detailsView) return;

  if (detailsView.caseType) {
    if (detailsView.caseType.includes('||')) {
      const [agency, caseType] = detailsView.caseType.split('||');
      whereConditions.push({
        [Op.and]: [
          { refAgency: agency },
          { caseType },
        ],
      });
    } else {
      whereConditions.push({ caseType: detailsView.caseType });
    }
  }

  if (detailsView.judge) {
    if (detailsView.judge === 'UNASSIGNED') {
      whereConditions.push(
        literal(
          "(`Docket`.`judge` IN ('', 'UNASSIGNED') OR `Docket`.`judge` IS NULL)",
        ),
      );
    } else {
      whereConditions.push({ judge: detailsView.judge });
    }
  }

  if (detailsView.refAgency) {
    whereConditions.push({ refAgency: detailsView.refAgency });
  }

  if (detailsView.judgeAssistant) {
    if (detailsView.judgeAssistant === 'UNASSIGNED') {
      whereConditions.push(
        literal(
          "(`Docket`.`judgeassistant` IN ('', 'UNASSIGNED') OR `Docket`.`judgeassistant` IS NULL)",
        ),
      );
    } else {
      whereConditions.push({ judgeAssistant: detailsView.judgeAssistant });
    }
  }
};

const addArrayInFilter = (whereConditions, values, fieldName) => {
  if (Array.isArray(values) && values.length) {
    whereConditions.push({ [fieldName]: { [Op.in]: values } });
  }
};

const addFilterDropdowns = (whereConditions, condition) => {
  if (!condition) return;

  addArrayInFilter(whereConditions, condition.judge, 'judge');
  addArrayInFilter(whereConditions, condition.refagency, 'refAgency');
  addArrayInFilter(whereConditions, condition.judgeassistant, 'judgeAssistant');
  addArrayInFilter(whereConditions, condition.county, 'county');
};

const addTypeSpecificConditions = (
  whereConditions,
  type,
  casetypeRestrictionData,
  holidaysData,
) => {
  switch (type) {
    case 'sop':
      whereConditions.push(
        literal(
          "(`Docket`.`datereceivedbyOSAH` = '0000-00-00' OR (`Docket`.`datereceivedbyOSAH` IS NOT NULL AND `Docket`.`datereceivedbyOSAH` != '0000-00-00' AND DATEDIFF(CURDATE(), `Docket`.`datereceivedbyOSAH`) > 90))",
        ),
      );
      break;
    case 'no-hearing-date': {
      whereConditions.push(
        literal(
          "(`Docket`.`hearingdate` IS NULL OR `Docket`.`hearingdate` = '0000-00-00')",
        ),
      );

      const { casetypeRestrictionArray } = buildCasetypeRestrictionConditions(
        casetypeRestrictionData,
        holidaysData,
        'hearing',
      );

      if (casetypeRestrictionArray.length) {
        whereConditions.push(
          literal(`(${casetypeRestrictionArray.join(' OR ')})`),
        );
      }
      break;
    }
    case 'no-decision': {
      const baseStatusCondition = {
        status: {
          [Op.in]: ['Hearing Scheduled', 'Hearing Re-scheduled', 'Rescheduled'],
        },
      };
      const decisionLiteral = literal(
        "`Docket`.`caseid` NOT IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType = 'Decision' AND roc_flag = '0')",
      );

      const { casetypeRestrictionArray: casetypeRestrictionArrayDecision } =
        buildCasetypeRestrictionConditions(
          casetypeRestrictionData,
          holidaysData,
          'decision',
        );

      if (casetypeRestrictionArrayDecision.length) {
        whereConditions.push(
          baseStatusCondition,
          decisionLiteral,
          literal(`(${casetypeRestrictionArrayDecision.join(' OR ')})`),
        );
      } else {
        whereConditions.push(baseStatusCondition, decisionLiteral);
      }

      break;
    }
    case 'decision':
      whereConditions.push(
        literal(
          "`Docket`.`caseid` IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType = 'Decision' AND roc_flag = '0')",
        ),
      );
      break;
    case 'no-noh':
      whereConditions.push(
        literal(
          "`Docket`.`caseid` NOT IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType IN ('NOH', 'B-NOH', 'NOH-Motion', 'T-NOH', 'Notice Of Hearing'))",
        ),
      );
      break;
    default:
      break;
  }
};

/**
 * Build where conditions for aging reports
 * @param {Object} param - Filter parameters
 * @param {string} type - Report type
 * @param {Object} casetypeRestrictionData - Casetype restriction data
 * @param {Object} holidaysData - Holidays data
 * @returns {Array} Array of where conditions
 */
export function buildAgingReportsWhereConditions(param, type, casetypeRestrictionData, holidaysData) {
  const whereConditions = [];
  const condition = param.filter || {};
  const view = param.view || {};
  const detailsView = view.detailsView;

  // Common where conditions
  whereConditions.push({ telvOFive: '1' });
  addStatusCondition(whereConditions, condition.stayed);

  if (type === 'open-cases') {
    addOpenCasesDateFilters(whereConditions, condition);
  }

  addCaseTypeFilter(whereConditions, condition.casetype);
  addDetailsViewFilters(whereConditions, detailsView);
  addFilterDropdowns(whereConditions, condition);
  addTypeSpecificConditions(whereConditions, type, casetypeRestrictionData, holidaysData);

  // Filter by case type
  if (Array.isArray(condition.casetype) && condition.casetype.length) {
    const caseTypeConditions = condition.casetype.map(ct => {
      if (ct.includes('||')) {
        const [agency, caseType] = ct.split('||');
        return {
          [Op.and]: [
            { refAgency: agency },
            { caseType: caseType }
          ]
        };
      }
      return { caseType: ct };
    });
    whereConditions.push({ [Op.or]: caseTypeConditions });
  }

  // Add detailsView filters
  if (detailsView) {
    if (detailsView.caseType) {
      if (detailsView.caseType.includes('||')) {
        const [agency, caseType] = detailsView.caseType.split('||');
        whereConditions.push({
          [Op.and]: [
            { refAgency: agency },
            { caseType: caseType }
          ]
        });
      } else {
        whereConditions.push({ caseType: detailsView.caseType });
      }
    }
    if (detailsView.judge) {
      if (detailsView.judge === 'UNASSIGNED') {
        whereConditions.push(
          literal(`(\`Docket\`.\`judge\` IN ('', 'UNASSIGNED') OR \`Docket\`.\`judge\` IS NULL)`)
        );
      } else {
        whereConditions.push({ judge: detailsView.judge });
      }
    }
    if (detailsView.refAgency) {
      whereConditions.push({ refAgency: detailsView.refAgency });
    }
    if (detailsView.judgeAssistant) {
      if (detailsView.judgeAssistant === 'UNASSIGNED') {
        whereConditions.push(
          literal(`(\`Docket\`.\`judgeassistant\` IN ('', 'UNASSIGNED') OR \`Docket\`.\`judgeassistant\` IS NULL)`)
        );
      } else {
        whereConditions.push({ judgeAssistant: detailsView.judgeAssistant });
      }
    }
  }

  // Filter by judge (from filter dropdown)
  if (Array.isArray(condition.judge) && condition.judge.length) {
    whereConditions.push({ judge: { [Op.in]: condition.judge } });
  }

  // Filter by agency (from filter dropdown)
  if (Array.isArray(condition.refagency) && condition.refagency.length) {
    whereConditions.push({ refAgency: { [Op.in]: condition.refagency } });
  }

  // Filter by CMA (from filter dropdown)
  if (Array.isArray(condition.judgeassistant) && condition.judgeassistant.length) {
    whereConditions.push({ judgeAssistant: { [Op.in]: condition.judgeassistant } });
  }

  // Filter by county (from filter dropdown)
  if (Array.isArray(condition.county) && condition.county.length) {
    whereConditions.push({ county: { [Op.in]: condition.county } });
  }

  // Type-specific conditions
  switch (type) {
    case 'sop':
      // PHP condition: datereceivedbyOSAH < DATE_ADD(CURRENT_DATE, INTERVAL -90 DAY)
      whereConditions.push(literal(
        `(\`Docket\`.\`datereceivedbyOSAH\` = '0000-00-00' OR ` +
        `(\`Docket\`.\`datereceivedbyOSAH\` IS NOT NULL AND ` +
        `\`Docket\`.\`datereceivedbyOSAH\` != '0000-00-00' AND ` +
        `DATEDIFF(CURDATE(), \`Docket\`.\`datereceivedbyOSAH\`) > 90))`
      ));
      break;
    case 'no-hearing-date': {
      whereConditions.push(literal(`(\`Docket\`.\`hearingdate\` IS NULL OR \`Docket\`.\`hearingdate\` = '0000-00-00')`));
      const { casetypeRestrictionArray } = buildCasetypeRestrictionConditions(
        casetypeRestrictionData,
        holidaysData,
        'hearing'
      );
      if (casetypeRestrictionArray.length) {
        whereConditions.push(literal(`(${casetypeRestrictionArray.join(' OR ')})`));
      }
      break;
    }
    case 'no-decision': {
      whereConditions.push({ status: { [Op.in]: ['Hearing Scheduled', 'Hearing Re-scheduled', 'Rescheduled'] } });
      whereConditions.push(literal(`\`Docket\`.\`caseid\` NOT IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType = 'Decision' AND roc_flag = '0')`));
      const { casetypeRestrictionArray: casetypeRestrictionArrayDecision } = buildCasetypeRestrictionConditions(
        casetypeRestrictionData,
        holidaysData,
        'decision'
      );
      if (casetypeRestrictionArrayDecision.length) {
        whereConditions.push(literal(`(${casetypeRestrictionArrayDecision.join(' OR ')})`));
      }
      break;
    }
    case 'decision':
      whereConditions.push(literal(`\`Docket\`.\`caseid\` IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType = 'Decision' AND roc_flag = '0')`));
      break;
    case 'no-noh':
      whereConditions.push(literal(`\`Docket\`.\`caseid\` NOT IN (SELECT DISTINCT(caseid) FROM documentstable WHERE DocumentType IN ('NOH', 'B-NOH', 'NOH-Motion', 'T-NOH', 'Notice Of Hearing'))`));
      break;
  }

  return whereConditions;
}