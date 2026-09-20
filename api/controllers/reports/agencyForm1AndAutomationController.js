import {
  agencyForm1ApprovalReports,
  decisionAutomationReports,
  getDocumentTypesForAutomation
} from "../../helpers/reports/agencyForm1AndAutomationReports.js";
import { Parser } from "@json2csv/plainjs";
import {
  validateAgencyForm1ApprovalReports,
  validateDecisionAutomationReports,
} from "../../helpers/reportValidators.js";
import {
  handleApiError,
  handleCsvExportError,
  handleCsvValidationError,
  buildCsvFields,
  exportCsvWithTimestamp,
} from "./shared/controllerUtils.js";
import { logger } from "../../../config/winstonLogger.js";

/*
    Created by  : Snehal Narkar
    Date        : 1-12-2025
    Description : Function is used to fetch agency form1 approval reports with various filters
    Parameters  :
        - req : Express request object containing filter parameters in body
            - clerk (Array): Clerk filter
            - county (Array): County filter
            - agency (Array): Agency filter
            - casetypes (Array): Case types filter
            - judge (Array): Judge filter
            - judgeassistant (Array): Judge assistant filter
            - staffattorney (Array): Staff attorney filter
            - status (Array): Status filter
            - dateReceivedfrom (String): Start date filter (MM-DD-YYYY)
            - dateReceivedto (String): End date filter (MM-DD-YYYY)
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data array, and error
*/
export const getAgencyForm1ApprovalReports = async (req, res) => {
  try {
    const param = req.body || {};

    // Validate input using Joi schema
    const filters = validateAgencyForm1ApprovalReports(param);

    const { results, pagination } = await agencyForm1ApprovalReports(filters);

    return res.status(200).json({
      success: true,
      message: results.length > 0 ? "Agency Form1 approval reports fetched successfully." : "No agency Form1 approval reports found.",
      data: { result: results, pagination },
      error: null,
    });
  } catch (error) {
    return handleApiError(res, error, "agencyForm1ApprovalReports controller");
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 1-12-2025
    Description : Function is used to export agency form1 approval reports to CSV
    Parameters  :
        - req : Express request object containing filter parameters in body
        - res : Express response object for sending the CSV file

    Response    : Returns CSV file download
*/
export const exportAgencyForm1ApprovalReport = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Validate input using Joi schema with exportMode enabled
    const filters = validateAgencyForm1ApprovalReports({ ...param, exportMode: true });

    const data = await agencyForm1ApprovalReports(filters);

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found to export",
        data: null,
        error: null,
      });
    }

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
      'location',
      'judgeAssistant',
      'judge',
      'staffAttorney',
      'docketClerk',
    ]);

    return exportCsvWithTimestamp(res, data, fields, 'agencyform1approval');

  } catch (error) {
    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.name === 'ValidationError') {
      return handleCsvValidationError(res, error, "exportAgencyForm1ApprovalReport");
    }

    return handleCsvExportError(res, error);
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 03-12-2025
    Description : Function is used to fetch decision automation reports with various filters
    Parameters  :
        - req : Express request object containing filter parameters in body
            - automation_flag (String): Automation flag filter ('decision', 'continuance', or 'noh')
            - casetypes (Array): Case type filter
            - judge (Array): Judge filter
            - cma (Array): CMA filter
            - agency (Array): Agency filter
            - automation_sub_type (Array): Automation sub type filter
            - daterecivedfrom (String): Date received from filter (MM-DD-YYYY)
            - datereceivedto (String): Date received to filter (MM-DD-YYYY)
            - automationdatefrom (String): Automation date from filter (MM-DD-YYYY)
            - automationdateto (String): Automation date to filter (MM-DD-YYYY)
            - hearingdatefrom (String): Hearing date from filter (MM-DD-YYYY)
            - hearingdateto (String): Hearing date to filter (MM-DD-YYYY)
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data array, and error
*/
export const getDecisionAutomationReports = async (req, res) => {
  try {
    const param = req.body || {};

    // Validate input using Joi schema
    const filters = validateDecisionAutomationReports(param);

    const { results, pagination } = await decisionAutomationReports(filters);

    return res.status(200).json({
      success: true,
      message: results.length > 0 ? "Decision automation reports fetched successfully." : "No decision automation reports found.",
      data: { result: results, pagination },
      error: null,
    });
  } catch (error) {
    return handleApiError(res, error, "getDecisionAutomationReports controller");
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 03-12-2025
    Description : Function is used to export decision automation reports to CSV
    Parameters  :
        - req : Express request object containing filter parameters in body (same as getDecisionAutomationReports)
        - res : Express response object for sending the CSV file

    Response    : Returns CSV file download
*/
export const exportDecisionAutomationReports = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Validate input using Joi schema with exportMode enabled
    const filters = validateDecisionAutomationReports({ ...param, exportMode: true });

    const data = await decisionAutomationReports(filters);

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found to export",
        data: null,
        error: null,
      });
    }

    // Dynamic column labels based on automation_flag
    let dateAutomatedLabel = "Date Decision Automated";
    let automationTypeLabel = "Decision Type";
    let fileNamePrefix = "decision_automation_report";

    if (filters.automation_flag === 'continuance') {
      dateAutomatedLabel = "Date Continuance Automated";
      automationTypeLabel = "Continuance Type";
      fileNamePrefix = "continuance_automation_report";
    } else if (filters.automation_flag === 'noh') {
      dateAutomatedLabel = "Date NOH Automated";
      automationTypeLabel = "NOH Type";
      fileNamePrefix = "noh_automation_report";
    }

    // Build CSV fields using reusable configuration with dynamic labels
    const fields = buildCsvFields([
      'docket',
      'caseName',
      'agencyCode',
      'caseCode',
      'dateReceived',
      'hearingDate',
      { label: dateAutomatedLabel, value: "decisionAutomationDate" },
      { label: automationTypeLabel, value: "automationSubType" },
      'judge',
      'cma',
    ]);

    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(data);

    const fileName = `${fileNamePrefix}_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Transfer-Encoding", "binary");

    return res.status(200).send(csvData);

  } catch (error) {
    logger.error("Error exporting decision automation reports:", error);

    // ✅ Return 400 for validation errors, 500 for server errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        data: null,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error exporting CSV",
      data: null,
      error: error.message,
    });
  }
};

/*
    Created by  : Snehal Narkar
    Date        : 03-12-2024
    Description : Function is used to fetch document types for automation (Decision, Continuance, NOH)
    Parameters  :
        - req : Express request object
        - res : Express response object for sending the result

    Response    : Returns object with decisionType, continuanceType, and nohType arrays
*/
export const getDocumentTypesForAutomationAPI = async (req, res) => {
  try {
    const result = await getDocumentTypesForAutomation();

    return res.status(200).json({
      success: true,
      message: "Document types for automation fetched successfully.",
      data: result,
      error: null,
    });
  } catch (error) {
    logger.error("Error in getDocumentTypesForAutomation controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
      error: error.message,
    });
  }
};

