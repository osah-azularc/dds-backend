import { customReports } from '../../helpers/reports/customReportsHelper.js';
import { validateCustomReports } from '../../helpers/reportValidators.js';
import { Parser } from '@json2csv/plainjs';
import { JudgeAssistantClerk } from "../../models/index.js";
import DocketOpenCloseDetails from "../../models/DocketOpenCloseDetails.js";
import {col } from "sequelize";
import { handleApiError, handleCsvExportError } from './shared/controllerUtils.js';
import { logger } from "../../../config/winstonLogger.js";

/**
 * Get custom reports dashboard data (grouped by judge/casetype)
 * Route: /reports/getCaseTypeJudge
 *
 * @param {Object} req.body - Request payload
 * @param {Object} req.body.filters - Filter object with 14 filters
 * @param {string} req.body.viewType - 'judges' or 'casetypes'
 *
 * @returns {Object} JSON response with grouped dashboard data
 */
export const getCustomReportsDashboard = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Ensure detailsView is NOT present (dashboard only)
    if (param.detailsView) {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is for dashboard view only. Use /getCaseTypeJudgeDetail for details view.',
        error: 'Invalid request - detailsView should not be present',
      });
    }

    // ✅ Validate input using Joi schema
    const validatedParam = validateCustomReports(param);

    const result = await customReports(validatedParam);

    return res.status(200).json({
      success: true,
      message: 'Custom reports dashboard fetched successfully',
      data: result,
    });
  } catch (error) {
    return handleApiError(res, error, 'getCustomReportsDashboard controller');
  }
};

/**
 * Get custom reports details data (paginated table for specific judge/casetype)
 * Route: /reports/getCaseTypeJudgeDetail
 *
 * @param {Object} req.body - Request payload
 * @param {Object} req.body.filters - Filter object with 14 filters
 * @param {string} req.body.viewType - 'judges' or 'casetypes'
 * @param {Object} req.body.detailsView - Details view config (required)
 * @param {string} req.body.detailsView.itemName - Selected judge/casetype name
 * @param {number} req.body.detailsView.page - Page number
 * @param {number} req.body.detailsView.limit - Records per page
 *
 * @returns {Object} JSON response with paginated details data
 */
export const getCustomReportsDetails = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Ensure detailsView IS present (details only)
    if (!param.detailsView?.itemName) {
      return res.status(400).json({
        success: false,
        message: 'This endpoint requires detailsView with itemName.',
        error: 'Invalid request - detailsView.itemName is required',
      });
    }

    // ✅ Validate input using Joi schema
    const validatedParam = validateCustomReports(param);

    const result = await customReports(validatedParam);

    return res.status(200).json({
      success: true,
      message: 'Custom reports details fetched successfully',
      data: result,
    });
  } catch (error) {
    return handleApiError(res, error, 'getCustomReportsDetails controller');
  }
};

/**
 * Export custom reports to CSV
 * Supports both dashboard view and details view export
 *
 * @param {Object} req.body - Request payload (same as getCustomReports)
 * @param {string} req.body.responseType - Should be 'export'
 *
 * @returns {File} CSV file download
 */
export const exportCustomReports = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Validate input using Joi schema with exportMode enabled
    const validatedParam = validateCustomReports({ ...param, exportMode: true });

    const result = await customReports(validatedParam);
    const viewType = validatedParam.viewType || 'judges';

    let data = [];
    let fields = [];
    let filenamePrefix;

    let titleRow = null; // Title row for details view (added before column headers)

    // Check if details view or dashboard view
    if (result.details) {
      // Details view export (drill-down data)
      // Matching Angular format (line 200-203 in ReportsController.php)

      // Get selected item name and count for title row
      const selectedItem = validatedParam.detailsView?.itemName || '';
      const totalCount = result.details.length;

      // Format title row: "Judge - LastName, FirstName(count)" or "Case type - CaseType(count)"
      // This will be added as the FIRST row in CSV, before column headers
      titleRow = viewType === 'judges'
        ? `Judge - ${selectedItem.replace(' ', ', ')}(${totalCount})`
        : `Case type - ${selectedItem}(${totalCount})`;

      // Transform data with formatted values (no title row in data array)
      data = result.details.map(row => ({
        Docket: row.caseId,
        'Case Name': row.caseName,
        Agency: row.agency,
        'Case Type': row.caseType,
        'Date Received': row.dateReceived,
        'Hearing Date': row.hearingDate,
        'Days Since Hearing': row.daysSinceHearing,
        County: row.county,
        Location: row.location,
        Judge: row.judge,
        CMA: row.cma,
      }));

      filenamePrefix = 'excelsheets';

      fields = [
        { label: 'Docket', value: 'Docket' },
        { label: 'Case Name', value: 'Case Name' },
        { label: 'Agency', value: 'Agency' },
        { label: 'Case Type', value: 'Case Type' },
        { label: 'Date Received', value: 'Date Received' },
        { label: 'Hearing Date', value: 'Hearing Date' },
        { label: 'Days Since Hearing', value: 'Days Since Hearing' },
        { label: 'County', value: 'County' },
        { label: 'Location', value: 'Location' },
        { label: 'Judge', value: 'Judge' },
        { label: 'CMA', value: 'CMA' },
      ];
    } else {
      filenamePrefix = 'excelsheets';

      // Transform grouped data into flat array for CSV
      const groupedData = result.data || {};
      data = [];

      Object.entries(groupedData).forEach(([groupKey, cases]) => {
        cases.forEach(item => {
          data.push({
            Judge: viewType === 'judges' ? groupKey : item.title,
            Agency: item.agency || '',
            Casetype: viewType === 'judges' ? item.title : groupKey,
            '# of dockets': item.count,
          });
        });
      });

      // Define fields matching Angular format
      fields = [
        { label: 'Judge', value: 'Judge' },
        { label: 'Agency', value: 'Agency' },
        { label: 'Casetype', value: 'Casetype' },
        { label: '# of dockets', value: '# of dockets' },
      ];
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data available to export',
      });
    }

    // Convert to CSV
    const json2csvParser = new Parser({ fields });
    let csv = json2csvParser.parse(data);

    if (titleRow) {
      csv = titleRow + '\n' + csv;
    }

    // Generate filename with timestamp (matching monthly reports format)
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${filenamePrefix}-${dateStr} ${timeStr}.csv`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).send(csv);
  } catch (error) {
    return handleCsvExportError(res, error, 'exportCustomReports controller');
  }
};

/**
 * Get users who have opened or closed dockets
 * Used for "Opened By" and "Closed By" filters in Custom Report
 * 
 * Returns:
 * {
 *   opened_by: [{ user_id, FirstName, LastName }],
 *   closed_by: [{ user_id, FirstName, LastName }]
 * }
 */
export const getUsers = async (req, res) => {
  try {
    // Get users who closed dockets (docket_status = 'closed')
    const closedByUsers = await JudgeAssistantClerk.findAll({
      attributes: [
        [col('JudgeAssistantClerk.user_id'), 'user_id'],
        [col('JudgeAssistantClerk.FirstName'), 'FirstName'],
        [col('JudgeAssistantClerk.LastName'), 'LastName'],
      ],
      include: [
        {
          model: DocketOpenCloseDetails,
          as: 'docketOpenCloseDetails',
          required: true,
          attributes: [],
          where: {
            docketStatus: 'closed',
          },
        },
      ],
      group: [col('JudgeAssistantClerk.user_id')],
      order: [[col('JudgeAssistantClerk.LastName'), 'ASC']],
      raw: true,
    });

    // Get users who opened dockets (docket_status = 'open' or 're_opened')
    const openedByUsers = await JudgeAssistantClerk.findAll({
      attributes: [
        [col('JudgeAssistantClerk.user_id'), 'user_id'],
        [col('JudgeAssistantClerk.FirstName'), 'FirstName'],
        [col('JudgeAssistantClerk.LastName'), 'LastName'],
      ],
      include: [
        {
          model: DocketOpenCloseDetails,
          as: 'docketOpenCloseDetails',
          required: true,
          attributes: [],
          where: {
            docketStatus: ['open', 're_opened'],
          },
        },
      ],
      group: [col('JudgeAssistantClerk.user_id')],
      order: [[col('JudgeAssistantClerk.LastName'), 'ASC']],
      raw: true,
    });

    return res.status(200).json({
      closed_by: closedByUsers,
      opened_by: openedByUsers,
    });
  } catch (error) {
    logger.error('❌ Error fetching opened/closed by users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};

