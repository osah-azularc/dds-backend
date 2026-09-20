import {
  bulkdocReports,
  bulkdesignationReports,
} from "../../helpers/reports/bulkReports.js";
import {
  validateBulkDocReports,
  validateBulkDesignationReports,
} from "../../helpers/reportValidators.js";
import {
  handleApiError,
  handleCsvExportError,
  handleCsvValidationError,
  buildCsvFields,
  exportCsvWithTimestamp,
} from "./shared/controllerUtils.js";

/*
    Created by  : Snehal Narkar
    Date        : 14-11-2025
    Description : Function is used to fetch bulk document reports with various filters
    Parameters  :
        - req : Express request object containing filter parameters in body
            - refagency (Array): Reference agency filter
            - casetype (String): Case type filter
            - judge (Array): Judge filter
            - cma (Array): CMA filter
            - dateGeneratedFrom (String): Start date filter (MM-DD-YYYY)
            - dateGeneratedTo (String): End date filter (MM-DD-YYYY)
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data array, and error
*/
export const getBulkdocReports = async (req, res) => {
  try {
    const param = req.body || {};

    // Validate input using Joi schema
    const filters = validateBulkDocReports(param);

    const { results, pagination } = await bulkdocReports(filters);

    return res.status(200).json({
      success: true,
      message: results.length > 0 ? "Bulk document reports fetched successfully." : "No bulk document reports found.",
      data: { result: results, pagination },
      error: null,
    });
  } catch (error) {
    return handleApiError(res, error, "bulkdocReports controller");
  }
};


/*
    Created by  : Snehal Narkar
    Date        : 19-11-2025
    Description: Export bulk document report as CSV
 */
export const exportBulkDocReport = async (req, res) => {
  try {
    const param = req.body.data ? JSON.parse(req.body.data) : (req.body || {});

    // Validate input using Joi schema
    const filters = validateBulkDocReports(param);

    // Set export mode to fetch all data (no pagination)
    filters.exportMode = true;
    // Force Case ID ASC sorting for export
    filters.sortBy = 'caseId';
    filters.sortOrder = 'ASC';
    const result = await bulkdocReports(filters);

    // Build CSV fields using reusable configuration
    const fields = buildCsvFields([
      'docket',
      'caseName',
      'refAgency',
      'caseType',
      'dateReceived',
      'hearingDate',
      'county',
      'status',
      'location',  // KEY in config → maps to value: "hearingSite"
      'judge',
      'judgeAssistant',
      'clerk',
    ]);

    return exportCsvWithTimestamp(res, result, fields, 'excelsheets');

  } catch (error) {
    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.name === 'ValidationError') {
      return handleCsvValidationError(res, error, "exportBulkDocReport");
    }

    return handleCsvExportError(res, error);
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 25-11-2025
    Description : Function is used to fetch bulk document reports with various filters
    Parameters  :
        - req : Express request object containing filter parameters in body
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data array, and error
*/
export const getBulkDesignationReports = async (req, res) => {
  try {
    const param = req.body || {};

    // Validate input using Joi schema
    const filters = validateBulkDesignationReports(param);

    const { results, pagination } = await bulkdesignationReports(filters);

    return res.status(200).json({
      success: true,
      message: results.length > 0 ? "Bulk designation reports fetched successfully." : "No bulk designation reports found.",
      data: { result: results, pagination },
      error: null,
    });
  } catch (error) {
    return handleApiError(res, error, "bulkdesignationReports controller");
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 26-11-2025
    Description: Export bulk designation report as CSV
 */
export const exportBulkDesignationReport = async (req, res) => {
  try {
    const param = req.body.data ? JSON.parse(req.body.data) : (req.body || {});

    // Validate input using Joi schema
    const filters = validateBulkDesignationReports(param);

    // Set export mode to fetch all data (no pagination)
    filters.exportMode = true;
    const result = await bulkdesignationReports(filters);

    // Build CSV fields using reusable configuration
    const fields = buildCsvFields([
      'docket',
      'caseName',
      'agencyCode',
      'caseCode',
      'dateReceived',
      'hearingDate',
      'decisionAutomationDate',
      'judge',
      'cma',
    ]);

    return exportCsvWithTimestamp(res, result, fields, 'excelsheets');

  } catch (error) {
    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.name === 'ValidationError') {
      return handleCsvValidationError(res, error, "exportBulkDesignationReport");
    }

    return handleCsvExportError(res, error);
  }
};