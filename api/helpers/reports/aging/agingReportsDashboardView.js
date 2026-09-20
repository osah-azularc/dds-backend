import { Op, fn, col, literal } from "sequelize";
import { Docket } from "../../../models/index.js";

/**
 * Helper function to format names with comma (Last, First)
 * @param {string} name - Name to format
 * @param {string} defaultValue - Default value if name is empty
 * @returns {string} Formatted name
 */
function formatNameWithComma(name, defaultValue = '') {
  if (!name || name === '') {
    return defaultValue;
  }
  const parts = name.split(' ');
  if (parts.length > 1) {
    return parts[0] + ', ' + parts.slice(1).join(' ');
  }
  return name;
}

/**
 * Fetch dashboard view data for aging reports
 * @param {Array} whereConditions - Where conditions array
 * @param {string} view2Selected - View type (judges, agency, cma, case-types)
 * @param {boolean} exportDashboard - Whether this is export mode
 * @returns {Promise<Object>} Dashboard data object
 */
export async function fetchAgingReportsDashboard(whereConditions, view2Selected, exportDashboard = false) {
  let groupByFields = [];
  let orderByFields = [];

  // Determine grouping and ordering based on view type
  if (exportDashboard) {
    groupByFields = ['judge', 'judgeAssistant', 'casetype', 'refagency'];
    orderByFields = [['judge', 'ASC'], ['refagency', 'ASC'], ['casetype', 'ASC']];
  } else {
    switch (view2Selected) {
      case 'judges':
        groupByFields = ['judge', 'casetype', 'refagency'];
        orderByFields = [['casetype', 'ASC'], ['judge', 'ASC'], ['refagency', 'ASC']];
        break;
      case 'agency':
        groupByFields = ['judge', 'refagency'];
        orderByFields = [['judge', 'ASC'], ['refagency', 'ASC']];
        break;
      case 'cma':
        groupByFields = ['judgeassistant', 'casetype', 'refagency'];
        orderByFields = [['casetype', 'ASC'], ['judgeassistant', 'ASC'], ['refagency', 'ASC']];
        break;
      case 'case-types':
        groupByFields = ['judge', 'casetype', 'refagency'];
        orderByFields = [['judge', 'ASC'], ['refagency', 'ASC'], ['casetype', 'ASC']];
        break;
    }
  }

  // Build ORDER BY with CASE statements to handle NULL/empty values
  const orderByWithCase = orderByFields.map(([field, direction]) => {
    if (field === 'judge') {
      return literal(`CASE WHEN \`Docket\`.\`judge\` IS NULL OR \`Docket\`.\`judge\` = '' THEN 'UNASSIGNED' ELSE \`Docket\`.\`judge\` END ${direction}`);
    } else if (field === 'judgeassistant') {
      return literal(`CASE WHEN \`Docket\`.\`judgeassistant\` IS NULL OR \`Docket\`.\`judgeassistant\` = '' THEN 'UNASSIGNED' ELSE \`Docket\`.\`judgeassistant\` END ${direction}`);
    } else if (field === 'refagency' || field === 'casetype') {
      return [col(`Docket.${field}`), direction];
    }
    return [field, direction];
  });

  // Fetch grouped data with subQuery disabled for better performance
  const groupedDataRaw = await Docket.findAll({
    attributes: [
      "judge",
      "judgeAssistant",
      "refAgency",
      "caseType",
      [fn("COUNT", col("*")), "count"]
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    group: groupByFields,
    order: orderByWithCase,
    raw: true,
    subQuery: false, // ✅ Disable subquery for better performance
    logging: false,
  });

  // Transform grouped data to format names
  const groupedData = groupedDataRaw.map(row => {
    const data = row;
    return {
      judge: formatNameWithComma(data.judge, 'UNASSIGNED'),
      judgeAssistant: formatNameWithComma(data.judgeAssistant, 'UNASSIGNED'),
      refAgency: data.refAgency,
      caseType: data.caseType,
      count: data.count
    };
  });

  // Find duplicate case types (exist in multiple agencies)
  const duplicateCaseTypesRaw = await Docket.findAll({
    attributes: [
      "judge",
      "caseType",
      [fn("COUNT", fn("DISTINCT", col("refagency"))), "distinctRefAgency"]
    ],
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    group: ["judge", "caseType"],
    having: literal("distinctRefAgency > 1"),
    raw: true,
    subQuery: false, // ✅ Disable subquery for better performance
    logging: false,
  });

  const duplicateCaseTypes = duplicateCaseTypesRaw.map(row => {
    const data = row;
    return {
      judge: formatNameWithComma(data.judge, 'UNASSIGNED'),
      caseType: data.caseType,
      distinctRefAgency: data.distinctRefAgency
    };
  });

  // ✅ Use Set for O(1) lookup instead of O(n) array operations
  const agencyCasetypeSet = new Set(duplicateCaseTypes.map(row => row.caseType));

  // Transform grouped data into frontend format
  const transformedData = {};
  const agencyCasetypeDropdown = [];

  groupedData.forEach(row => {
    let key, title;
    const isDuplicateCaseType = agencyCasetypeSet.has(row.caseType);

    switch (view2Selected) {
      case 'judges':
        key = row.judge;
        title = isDuplicateCaseType ? `${row.refAgency}||${row.caseType}` : row.caseType;
        break;
      case 'agency':
        key = row.refAgency;
        title = row.judge;
        break;
      case 'cma':
        key = row.judgeAssistant;
        title = isDuplicateCaseType ? `${row.refAgency}||${row.caseType}` : row.caseType;
        break;
      case 'case-types':
        key = isDuplicateCaseType ? `${row.refAgency}||${row.caseType}` : row.caseType;
        title = row.judge;
        break;
    }

    if (!transformedData[key]) {
      transformedData[key] = [];
    }

    transformedData[key].push({
      count: row.count,
      title: title
    });

    // Add to agencyCasetypeDropdown if duplicate
    if (isDuplicateCaseType) {
      const agencyCaseType = `${row.refAgency}||${row.caseType}`;
      if (!agencyCasetypeDropdown.includes(agencyCaseType)) {
        agencyCasetypeDropdown.push(agencyCaseType);
      }
    }
  });

  agencyCasetypeDropdown.sort((a, b) => a.localeCompare(b));

  // Sort transformed data by keys
  const sortedTransformedData = {};
  Object.keys(transformedData).sort((a, b) => a.localeCompare(b)).forEach(key => {
    sortedTransformedData[key] = transformedData[key];
  });

  return {
    data: sortedTransformedData,
    agencyCasetypeDropdown,
    exportDashboard: exportDashboard ? groupedData : undefined
  };
}

