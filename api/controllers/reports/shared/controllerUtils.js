import { Parser } from "@json2csv/plainjs";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * Shared utility functions for report controllers
 * Eliminates code duplication across different report controller files
 */

/**
 * Helper function to generate and send CSV response
 * @param {Object} res - Express response object
 * @param {Array} data - Data to convert to CSV
 * @param {Array} fields - Field definitions for CSV columns
 * @param {String} fileName - Name of the CSV file
 */
export const sendCsvResponse = (res, data, fields, fileName) => {
  const json2csvParser = new Parser({ fields });
  const csvData = json2csvParser.parse(data);

  res.setHeader("Pragma", "public");
  res.setHeader("Expires", "0");
  res.setHeader("Cache-Control", "must-revalidate, post-check=0, pre-check=0");
  res.setHeader("Cache-Control", "public");
  res.setHeader("Content-Description", "File Transfer");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  res.setHeader("Content-Transfer-Encoding", "binary");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

  return res.status(200).send(csvData);
};

/**
 * Helper function to handle CSV export errors
 * Eliminates duplication of error handling across export functions
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @returns {Object} JSON error response
 */
export const handleCsvExportError = (res, error) => {
  logger.error("CSV export error:", error);
  return res.status(500).json({
    success: false,
    message: "Error exporting CSV",
    data: null,
    error: error.message,
  });
};

/**
 * Helper function to handle standard API errors (validation and server errors)
 * Eliminates duplication of error handling across API endpoints
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {String} context - Context string for logging (e.g., "bulkdocReports controller")
 * @returns {Object} JSON error response
 */
export const handleApiError = (res, error, context) => {
  logger.error(`Error in ${context}:`, error);

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
    message: "Internal server error",
    data: null,
    error: error.message,
  });
};

/**
 * Helper function to handle CSV export validation errors
 * Eliminates duplication of validation error handling in export functions
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {String} context - Context string for logging (e.g., "exportBulkDocReport")
 * @returns {Object} JSON error response
 */
export const handleCsvValidationError = (res, error, context) => {
  logger.error(`Validation error in ${context}:`, error);
  return res.status(400).json({
    success: false,
    message: "Validation error",
    data: null,
    error: error.message,
  });
};

/**
 * CSV Field Definitions - Reusable field configurations for different report types
 * Eliminates duplication of field definitions across export functions
 */
export const CSV_FIELD_CONFIGS = {
  // Common fields used across multiple reports
  COMMON: {
    docket: { label: "Docket", value: "caseId" },
    caseName: { label: "Case Name", value: "caseName" },
    dateReceived: { label: "Date Received", value: "dateReceived" },
    hearingDate: { label: "Hearing Date", value: "hearingDate" },
    county: { label: "County", value: "county" },
    status: { label: "Status", value: "status" },
    location: { label: "Location", value: "hearingSite" },
  },

  // Agency field variations
  AGENCY: {
    refAgency: { label: "Agency", value: "refAgency" },
    agencyCode: { label: "Agency", value: "agencyCode" },
  },

  // Case Type field variations
  CASE_TYPE: {
    caseType: { label: "Case Type", value: "caseType" },
    caseCode: { label: "Case Type", value: "caseCode" },
  },

  // Judge/CMA field variations
  PERSONNEL: {
    judge: { label: "Judge", value: "judge" },
    judgeAssistant: { label: "CMA", value: "judgeAssistant" },
    cma: { label: "CMA", value: "cma" },
    staffAttorney: { label: "Staff Attorney", value: "staffAttorney" },
    clerk: { label: "Clerk", value: "clerk" },
    docketClerk: { label: "Clerk", value: "docketClerk" },
  },

  // Automation-specific fields
  AUTOMATION: {
    decisionAutomationDate: { label: "Date Decision Automated", value: "decisionAutomationDate" },
    automationSubType: { label: "Automation Type", value: "automationSubType" },
  },

  // Rejected Documents fields
  REJECTED_DOCS: {
    documentName: { label: "Document Name", value: "documentName" },
    createdDate: { label: "Document Uploaded Date", value: "createdDate" },
    platform: { label: "Platform", value: "platform" },
  },
};

/**
 * Helper function to build CSV fields array from configuration
 * @param {Array<string|Object>} fieldKeys - Array of field keys or custom field objects
 * @returns {Array<Object>} Array of field definitions for json2csv
 */
export const buildCsvFields = (fieldKeys) => {
  return fieldKeys.map(key => {
    // If it's already a field object, return it as-is
    if (typeof key === 'object' && key.label && key.value) {
      return key;
    }

    // Otherwise, look it up in the configuration
    for (const category of Object.values(CSV_FIELD_CONFIGS)) {
      if (category[key]) {
        return category[key];
      }
    }

    // Convert key to string to avoid '[object Object]' in error message
    const keyStr = typeof key === 'object' ? JSON.stringify(key) : String(key);
    throw new Error(`CSV field configuration not found for key: ${keyStr}`);
  });
};

/**
 * Helper function to export CSV with standard filename pattern
 * Eliminates duplication of CSV export logic for bulk doc, bulk designation, and agency form1 reports
 * @param {Object} res - Express response object
 * @param {Array} data - Data to export
 * @param {Array} fields - CSV field definitions
 * @param {string} filePrefix - Prefix for the filename (e.g., 'excelsheets', 'agencyform1approval')
 * @returns {Object} CSV response
 */
export const exportCsvWithTimestamp = (res, data, fields, filePrefix) => {
  const fileName = `${filePrefix}_${Date.now()}.csv`;
  return sendCsvResponse(res, data, fields, fileName);
};

