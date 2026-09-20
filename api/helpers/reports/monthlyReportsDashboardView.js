import { Op, fn, col, literal } from "sequelize";
import { Docket, JudgeAssistantClerk } from "../../models/index.js";
import { ValidationError } from "../validators.js";

/**
 * Get monthly reports dashboard view data
 * @param {Array} whereConditions - SQL where conditions
 * @param {Array} include - Sequelize include array for joins
 * @param {Object} view - View configuration (view1Selected, view2Selected)
 * @param {string} responseType - Response type ('export' or undefined)
 * @param {Object} get - Additional data to fetch (e.g., {clerksList: true})
 * @param {Array} agencyCasetypeList - List of case types with agency prepending
 * @param {boolean} isDateAfter2_5FeaturesDeployed - Whether date range is after 2.5 features
 * @returns {Promise<Object>} Dashboard data with grouped records
 */
export async function getMonthlyReportsDashboardView(whereConditions, include, view, responseType, get, agencyCasetypeList, isDateAfter2_5FeaturesDeployed) {
  const result = {};
  const view1Selected = view.view1Selected;
  const view2Selected = view.view2Selected || 'judges';

  // ✅ Whitelist allowed view1Selected values to prevent SQL injection
  // Note: view1Selected is already validated by Joi schema
  const allowedView1Values = ['judge', 'judgeassistant', 'staffattorney', 'docketclerk'];
  if (!allowedView1Values.includes(view1Selected)) {
    throw new ValidationError(
      `Invalid view1Selected value: '${view1Selected}'. Allowed values: ${allowedView1Values.join(', ')}`,
      'view1Selected'
    );
  }

  // Define columns for dashboard view
  const view1Expression = view1Selected === 'docketclerk'
    ? literal("IF(CONCAT(`jac`.`LastName`, ', ', `jac`.`FirstName`) IS NULL OR CONCAT(`jac`.`LastName`, ', ', `jac`.`FirstName`) = '', 'UNASSIGNED', CONCAT(`jac`.`LastName`, ', ', `jac`.`FirstName`))")
    : literal(`IF(\`Docket\`.\`${view1Selected}\` IS NULL OR \`Docket\`.\`${view1Selected}\` = '', 'UNASSIGNED', REPLACE(\`Docket\`.\`${view1Selected}\`, SUBSTRING_INDEX(\`Docket\`.\`${view1Selected}\`, ' ', 1), CONCAT(SUBSTRING_INDEX(\`Docket\`.\`${view1Selected}\`, ' ', 1), ',')))`);

  const attributes = [
    [view1Expression, view1Selected],
    'refAgency',
    'caseType',
    [fn('COUNT', col('*')), 'count']
  ];

  // Group by with TRIM function (keep literal for TRIM - cannot be replaced with Op)
  const groupBy = [
    literal(`TRIM(\`Docket\`.\`${view1Selected}\`)`),
    'caseType',
    'refAgency'
  ];

  // Determine order by - use column names directly instead of literal()
  let orderBy = [];
  if (responseType === 'export') {
    orderBy = [[view1Selected, 'ASC'], ['refAgency', 'ASC'], ['caseType', 'ASC']];
  } else {
    // For dashboard view, always order by view1 (judge/county/etc.) first, then caseType
    orderBy = [[view1Selected, 'ASC'], ['caseType', 'ASC']];
  }

  // Fetch grouped data with subQuery disabled for better performance
  const recordsRaw = await Docket.findAll({
    attributes,
    include,
    where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
    group: groupBy,
    order: orderBy,
    raw: true,
    subQuery: false, // ✅ Disable subquery for better performance (matches PHP behavior)
    logging: false,
  });

  // Convert Sequelize instances to plain objects
  const records = recordsRaw.map(r => r);

  // If not export, process data for dashboard
  if (!responseType || responseType !== 'export') {
    // Find duplicate casetypes across agencies
    // ✅ Optimized: Only group by view1Selected and caseType (matches PHP logic)
    const duplicateCasetypesRaw = await Docket.findAll({
      attributes: [
        'caseType',
        [fn('COUNT', fn('DISTINCT', col('refAgency'))), 'distinct_refagency']
      ],
      include,
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      group: [literal(`TRIM(\`Docket\`.\`${view1Selected}\`)`), 'caseType'],
      having: literal('COUNT(DISTINCT refAgency) > 1'),
      raw: true,
      subQuery: false, // ✅ Disable subquery for better performance
      logging: false,
    });

    // ✅ Use Set for O(1) lookup instead of O(n) array.includes()
    const duplicateCasetypesSet = new Set(duplicateCasetypesRaw.map(r => r.caseType));

    // Build agencyCasetypeDropdown for duplicate case types
    const agencyCasetypeDropdown = [];

    // Transform data for dashboard view
    const main = {};

    records.forEach(row => {
      const isDuplicateCaseType = duplicateCasetypesSet.has(row.caseType);

      let key, title;

      switch (view2Selected) {
        case 'case-types':
          // Group by case types, show view1Selected (judge/cma/etc.) as titles
          key = isDuplicateCaseType ? `${row.refAgency}||${row.caseType}` : row.caseType;
          title = row[view1Selected];
          break;
        case 'default':
        case 'judges':
        case 'counties':
        case 'cma':
        default:
          // Group by view1Selected (judge/cma/etc.), show case types as titles
          key = row[view1Selected];
          title = isDuplicateCaseType ? `${row.refAgency}||${row.caseType}` : row.caseType;
          break;
      }

      if (!main[key]) {
        main[key] = [];
      }

      main[key].push({
        count: row.count,
        title: title
      });

      // Add to agencyCasetypeDropdown if it's a duplicate case type
      if (isDuplicateCaseType) {
        const agencyCaseType = `${row.refAgency}||${row.caseType}`;
        if (!agencyCasetypeDropdown.includes(agencyCaseType)) {
          agencyCasetypeDropdown.push(agencyCaseType);
        }
      }
    });

    agencyCasetypeDropdown.sort((a, b) => a.localeCompare(b));

    // Also sort the inner arrays (case types within each judge/county)
    const sortedMain = {};

    // Helper function to extract last name for sorting (part before comma)
    const getLastNameForSort = (name) => {
      if (!name) return '';
      const commaIndex = name.indexOf(',');
      if (commaIndex > 0) {
        return name.substring(0, commaIndex).trim();
      }
      return name;
    };

    Object.keys(main)
      .sort((a, b) => {
        // Extract last names for sorting (handles "LastName, FirstName" format)
        const lastNameA = getLastNameForSort(a);
        const lastNameB = getLastNameForSort(b);
        // Case-insensitive alphabetical sort by last name only
        return lastNameA.toLowerCase().localeCompare(lastNameB.toLowerCase());
      })
      .forEach(key => {
        // Sort the inner array by title (case type or judge name)
        const sortedArray = main[key].sort((a, b) => {
          const titleA = getLastNameForSort(a.title);
          const titleB = getLastNameForSort(b.title);
          return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
        });
        sortedMain[key] = sortedArray;
      });

    // Calculate total count for dashboard view (sum of all counts)
    result.total = records.reduce((acc, r) => acc + Number.parseInt(r.count), 0);
    result.data = sortedMain;
    result.agencyCasetypeDropdown = agencyCasetypeDropdown;
  } else {
    // Export mode - return raw records
    result.total = records.reduce((acc, r) => acc + Number.parseInt(r.count), 0);
    result.data = records;
  }

  // Get clerks list if requested
  if (get?.clerksList) {
    const clerksListRaw = await JudgeAssistantClerk.findAll({
      attributes: ['user_id', 'FirstName', 'LastName'],
      where: {
        user_type: { [Op.in]: ['clerk', 'dds_clerk'] },
        email: { [Op.notIn]: ['clerktest@osah.ga.gov', 'azularc2@osah.ga.gov'] }
      },
      logging: false,
      raw: true,
    });
    // Convert to plain objects
    result.clerksList = clerksListRaw.map(c => c);
  }

  return result;
}

