import { monthlyReports } from "../../helpers/reports/monthlyReportsHelper.js";
import { validateMonthlyReports } from "../../helpers/reportValidators.js";
import { sendCsvResponse, handleCsvExportError, buildCsvFields } from "./shared/controllerUtils.js";
import { logger } from "../../../config/winstonLogger.js";

/*
    Created by  : Snehal Narkar
    Date        : 15-12-2024
    Description : Function is used to fetch monthly reports with various filters and views
    Parameters  :
        - req : Express request object containing filter and view parameters in body
            - filter: Object containing filter parameters
              - from (String): Start date (MM-DD-YYYY)
              - to (String): End date (MM-DD-YYYY)
              - refagency (String): Reference agency filter
              - casetype (Array): Case type filter (can include agency||casetype format)
              - docketclerk (String): Docket clerk filter
              - status (String): Status filter ('open', 'closed', 'all')
              - exclude_cases (String): '1' to exclude 91_days cases
            - view: Object containing view parameters
              - view1Selected (String): 'judge', 'judgeassistant', 'staffattorney', 'docketclerk'
              - view2Selected (String): 'judges' or 'case-types'
              - detailsView (Object): Details view parameters (e.g., {judge: 'Smith, John'})
            - get: Object for additional data requests
              - clerksList (Boolean): true to get clerks list
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data object, and error
*/
export const getMonthlyReports = async (req, res) => {
  try {
    const param = req.body.data ? JSON.parse(req.body.data) : (req.body || {});

    // ✅ Validate input using Joi schema
    const validatedParam = validateMonthlyReports(param);

    const result = await monthlyReports(validatedParam);

    return res.status(200).json({
      success: true,
      message: result && Object.keys(result).length > 0 ? "Monthly reports fetched successfully." : "No monthly reports found.",
      data: result,
      error: null,
    });
  } catch (error) {
    logger.error("Error in getMonthlyReports controller:", error);

    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.isValidationError || error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        data: null,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error fetching monthly reports",
      data: null,
      error: error.message,
    });
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 15-12-2024
    Description : Function is used to export monthly reports to CSV
    Parameters  :
        - req : Express request object containing filter and view parameters in body
            - Same parameters as getMonthlyReports
            - responseType: 'export'
        - res : Express response object for sending the CSV file

    Response    : Returns CSV file with monthly reports data
*/
export const exportMonthlyReports = async (req, res) => {
  try {
    const param = req.body.data ? JSON.parse(req.body.data) : (req.body || {});
    param.responseType = 'export';

    // ✅ Validate input using Joi schema
    const validatedParam = validateMonthlyReports(param);

    const result = await monthlyReports(validatedParam);
    const view1Selected = validatedParam.view?.view1Selected || 'judge';

    let data = [];
    let fields = [];
    let filenamePrefix;

    // Check if details view or dashboard view
    if (result.details) {
      // Details view export
      data = result.details;
      filenamePrefix = 'monthly_reports_details';

      // Build CSV fields using camelCase (matching transformed data)
      fields = buildCsvFields([
        { label: 'Case ID', value: 'caseId' },
        { label: 'Case Name', value: 'caseName' },
        { label: 'Agency', value: 'refAgency' },
        { label: 'Case Type', value: 'caseType' },
        { label: 'Date Received', value: 'dateReceivedDisplay' },
        { label: 'Hearing Date', value: 'hearingDateDisplay' },
        { label: 'Days Since Hearing', value: 'daysSinceHearing' },
        'county',
        { label: 'Hearing Site', value: 'hearingSite' },
        'judge',
        { label: 'Judge Assistant', value: 'judgeAssistant' },
      ]);
    } else {
      // Dashboard view export
      data = result.data || [];
      filenamePrefix = 'monthly_reports_dashboard';

      // Build CSV fields with dynamic label for view1Selected (camelCase)
      fields = buildCsvFields([
        { label: view1Selected.charAt(0).toUpperCase() + view1Selected.slice(1), value: view1Selected },
        { label: 'Agency', value: 'refAgency' },
        { label: 'Case Type', value: 'caseType' },
        { label: 'Count', value: 'count' },
      ]);
    }

    // Add timestamp to filename (matching Aging Reports format)
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${filenamePrefix}-${dateStr} ${timeStr}.csv`;

    // Use reusable CSV response helper
    return sendCsvResponse(res, data, fields, filename);

  } catch (error) {
    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.isValidationError || error.name === 'ValidationError') {
      logger.error("Validation error in exportMonthlyReports:", error);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        data: null,
        error: error.message,
      });
    }

    return handleCsvExportError(res, error);
  }
};

