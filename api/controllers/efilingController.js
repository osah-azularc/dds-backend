
import efilingService from "../services/efilingService.js";
import efilingDocumentService from "../services/efiling/efilingDocumentService.js";
import path from "path";
import fs from "fs";
import { logger } from '../../config/winstonLogger.js';

/**
 * Sanitizes and validates file paths to prevent path traversal attacks
 * @param {string} filePath - The file path to sanitize
 * @returns {string} - The sanitized absolute file path
 * @throws {Error} - If the path attempts to escape the working directory
 */
const sanitizePath = (filePath) => {
  const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolute = path.join(process.cwd(), normalized);
  if (!absolute.startsWith(process.cwd())) {
    throw new Error('Invalid file path');
  }
  return absolute;
};

/** 
    Created by  : Rizwan Hiroli 
    Date        : 14-11-2025 
    Description : Fetches all external documents that are pending and assigned to the logged-in user with pagination, search, and sorting
    Parameters  : 
        - req : Express request object containing query parameters in body 
            - page (Number): Page number (default: 1)
            - limit (Number): Items per page (default: 10)
            - searchValue (String): Search query for document name, type, or description
            - sortField (String): Field to sort by (default: 'date_submitted')
            - sortOrder (String): Sort direction 'ASC' or 'DESC' (default: 'DESC')
        - res : Express response object for sending the result 
 
    Response    : Returns JSON with success status, data array containing pending documents with documentId, caseId, documentType, description, dateSubmitted, documentName, status, and pagination info including total, page, limit, totalPages
*/
export const getPendingDocuments = async (req, res) => {
  try {
    const { page, limit, searchValue, sortField, sortOrder } = req.body;
    const userId = req.userId;

    const result = await efilingService.getPendingDocuments({
      page,
      limit,
      searchValue,
      sortField,
      sortOrder,
      userId,
    });

    res.status(200).json({
      success: true,
      data: result.documents,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error fetching pending documents:", { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending documents",
      error: error.message,
    });
  }
};

/** 
    Created by  : Rizwan Hiroli 
    Date        : 14-11-2025 
    Description : Fetches history of all documents processed by the logged-in user with pagination, search, and sorting
    Parameters  : 
        - req : Express request object containing query parameters in body 
            - page (Number): Page number (default: 1)
            - limit (Number): Items per page (default: 10)
            - searchValue (String): Search query for description
            - sortField (String): Field to sort by (default: 'created_date')
            - sortOrder (String): Sort direction 'ASC' or 'DESC' (default: 'DESC')
        - res : Express response object for sending the result 
 
    Response    : Returns JSON with success status, history records array with formatted dates (created_date, created_time), description, created_by, modifier_name from JudgeAssistantClerk, and pagination info including total, page, limit, totalPages
*/
export const getHistory = async (req, res) => {
  try {
    const { page, limit, searchValue, sortField, sortOrder } = req.body;
    const userId = req.userId;

    const result = await efilingService.getHistory({
      page,
      limit,
      searchValue,
      sortField,
      sortOrder,
      userId,
    });

    return res.status(200).json({
      status: 200,
      message: "History fetched successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error fetching history:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      title: "Failed to fetch history",
      message: "Unable to fetch e-filing history. Please try again.",
      success: false,
    });
  }
};

/** 
    Created by  : Rizwan Hiroli 
    Date        : 14-11-2025 
    Description : Fetches detailed information for a specific document including submitter, case, and party details
    Parameters  : 
        - req : Express request object containing route parameters
            - documentId (Number): Document ID to fetch details for
        - res : Express response object for sending the result 
 
    Response    : Returns JSON with success status and document details in camelCase format including documentId, caseId, documentType, documentName, description, dateSubmitted, timeSubmitted, status, documentFilePath, createdBy, submitter object, and docket object with petitioner/respondent details
*/
export const getDocumentDetails = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({
        status: 400,
        message: "Document ID is required",
        success: false,
      });
    }

    const documentDetails = await efilingService.getDocumentDetails(documentId);

    if (!documentDetails) {
      return res.status(404).json({
        status: 404,
        message: "Document not found",
        success: false,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Document details fetched successfully",
      success: true,
      data: documentDetails, // Already in camelCase from service
    });
  } catch (error) {
    logger.error("Error fetching document details:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: "Failed to fetch document details",
      success: false,
    });
  }
};

/**
 * Review document (approve/reject) with email notification
 */
export const reviewDocument = async (req, res) => {
  try {
    const { documentId, action, documentTableData, commonData, history, rejectReason } = req.body;
    const userId = req.userId;

    // Convert camelCase to snake_case for database operations
    const dbDocumentTableData = {
      status: documentTableData.status,
      document_name: documentTableData.documentName,
      document_type: documentTableData.documentType,
      description: documentTableData.description,
      form_status_desc: documentTableData.formStatusDesc,
      assigned_to: documentTableData.assignedTo,
    };

    const result = await efilingService.reviewDocument({
      documentId,
      action,
      documentTableData: dbDocumentTableData,
      commonData: {
        caseid: commonData.caseid,
        document_id: commonData.documentId,
        documentActivity: commonData.documentActivity,
      },
      history,
      rejectReason,
      userId,
    });

    return res.status(200).json({
      status: 200,
      message: `Document ${action}ed successfully`,
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error reviewing document:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: "Failed to review document",
      success: false,
      error: error.message,
    });
  }
};

/**
 * Download document
 */
export const downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.userId;

    const documentDetails = await efilingDocumentService.getDocumentDetails(documentId, userId);

    if (!documentDetails) {
      return res.status(404).json({
        status: 404,
        message: "Document not found",
        success: false,
      });
    }

    // Use sanitizePath to prevent path traversal
    const absoluteFilePath = sanitizePath(documentDetails.documentFilePath);

    if (!fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({
        status: 404,
        message: "File not found on server",
        success: false,
      });
    }

    res.download(absoluteFilePath, documentDetails.documentName, (err) => {
      if (err) {
        logger.error("Error downloading file:", { error: err.message, stack: err.stack });
        return res.status(500).json({
          status: 500,
          message: "Failed to download file",
          success: false,
        });
      }
    });
  } catch (error) {
    logger.error("Error in downloadDocument:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: error.message || "Failed to download document",
      success: false,
    });
  }
};

/** 
    Created by  : Rizwan Hiroli 
    Date        : 14-11-2025 
    Description : Checks if a document file exists at the specified file path on the server
    Parameters  : 
        - req : Express request object containing body parameters
            - filePath (String): File path to check for existence
        - res : Express response object for sending the result 
 
    Response    : Returns JSON with success status and exists boolean indicating whether the file exists at the specified path
*/
export const checkFileExists = async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        status: 400,
        message: "File path is required",
        success: false,
        exists: false,
      });
    }

    // Use sanitizePath to prevent path traversal
    const absoluteFilePath = sanitizePath(filePath);
    const exists = fs.existsSync(absoluteFilePath);

    return res.status(200).json({
      status: 200,
      message: exists ? "File exists" : "File not found",
      success: true,
      exists: exists,
    });
  } catch (error) {
    logger.error("Error checking file existence:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: error.message || "Failed to check file existence",
      success: false,
      exists: false,
    });
  }
};

/**
 * Get case documents
 */
export const getCaseDocuments = async (req, res) => {
  try {
    const { caseid } = req.params;

    if (!caseid || isNaN(caseid) || caseid <= 0) {
      return res.status(400).json({
        status: 400,
        message: "Invalid Case ID format",
        success: false,
      });
    }

    const documents = await efilingService.getCaseDocuments(caseid);

    return res.status(200).json({
      status: 200,
      message: "Documents fetched successfully",
      success: true,
      data: documents,
    });
  } catch (error) {
    logger.error("Error fetching case documents:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: "Failed to fetch case documents",
      success: false,
    });
  }
};
