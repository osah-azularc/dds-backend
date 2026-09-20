import moment from 'moment';

/**
 * Transform grouped results into monthly report format
 * Format: { "Judge Name": [{ count, title, agency }] }
 * 
 * @param {Array} results - Raw query results from Sequelize
 * @param {string} viewType - 'judges' or 'casetypes'
 * @returns {Object} Formatted dashboard data with total count
 */
export function formatDashboardData(results, viewType) {
  const groupByField = viewType === 'judges' ? 'judge' : 'caseType';
  const main = {};
  let total = 0;

  results.forEach((row) => {
    const groupKey = row[groupByField] || 'UNASSIGNED';
    const caseType = row.caseType || 'Unknown';
    const agency = row.refAgency || '';
    const count = Number.parseInt(row.count, 10) || 0;

    if (!main[groupKey]) {
      main[groupKey] = [];
    }

    // For judges view: group by judge, show case types as titles
    // For case-types view: group by case type, show judges as titles
    const title = viewType === 'judges' ? caseType : groupKey;

    main[groupKey].push({
      count: count,
      title: title,
      agency: agency,
    });

    total += count;
  });

  const sortedMain = {};
  Object.keys(main)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .forEach(key => {
      // Sort the inner array by title
      const sortedArray = main[key].sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      );
      sortedMain[key] = sortedArray;
    });

  return {
    data: sortedMain,
    total,
  };
}

/**
 * Transform detail rows to match frontend expectations
 * 
 * @param {Array} rows - Raw query results from Sequelize
 * @returns {Array} Formatted details data
 */
export function formatDetailsData(rows) {
  return rows.map((row) => {
    let daysSinceHearing = '';
    if (row.hearingDate) {
      const hearingMoment = moment(row.hearingDate);
      const today = moment();
      const daysDiff = today.diff(hearingMoment, 'days');
      daysSinceHearing = daysDiff > 0 ? daysDiff.toString() : '--';
    }

    // Handle case name: treat null, empty, "(NULL)", ", " as "No party added"
    let caseName = row.caseName;
    if (!caseName || caseName.trim() === '' || caseName === '(NULL)' || caseName.trim() === ',') {
      caseName = null;
    }

    return {
      caseId: row.caseId,
      docket: row.docketNumber,
      caseName: caseName,
      agency: row.refAgency,
      caseType: row.caseType,
      dateReceived: row.dateReceivedByOSAH ? moment(row.dateReceivedByOSAH).format('MM-DD-YYYY') : '',
      hearingDate: row.hearingDate ? moment(row.hearingDate).format('MM-DD-YYYY') : '...',
      daysSinceHearing,
      county: row.county || '...',
      location: row.hearingSite || '...',
      judge: row.judge,
      cma: row.judgeAssistant,
    };
  });
}

/**
 * Field mapping for sorting
 * Maps frontend field names to database column names
 */
export const FIELD_MAPPING = {
  caseId: 'caseId',
  docket: 'docketNumber',
  caseName: 'caseName',
  agency: 'refAgency',
  caseType: 'caseType',
  dateReceived: 'dateReceivedByOSAH',
  hearingDate: 'hearingDate',
  daysSinceHearing: 'hearingDate',
  county: 'county',
  status: 'status',
  location: 'hearingSite',
  judge: 'judge',
  cma: 'judgeAssistant',
  staffAttorney: 'staffAttorney',
  clerk: 'docketClerk',
};

