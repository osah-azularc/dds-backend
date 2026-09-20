import efilingDocumentService from './efiling/efilingDocumentService.js';
import efilingHistoryService from './efiling/efilingHistoryService.js';
import efilingNotificationService from './efiling/efilingNotificationService.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * E-Filing Service (Main Orchestrator)
 * Coordinates between specialized services
 */
class EfilingService {
  /** 
      Created by  : Rizwan Hiroli 
      Date        : 14-11-2025 
      Description : Fetches pending documents for review by delegating to efilingDocumentService with pagination, search, and sorting capabilities
      Parameters  : 
          - params (Object): Query parameters for fetching pending documents
              - page (Number): Page number for pagination (default: 1)
              - limit (Number): Number of items per page (default: 10)
              - searchValue (String): Optional search term for filtering documents by name, type, or description
              - sortField (String): Field name to sort by (default: 'dateSubmitted')
              - sortOrder (String): Sort order 'ASC' or 'DESC' (default: 'DESC')
              - userId (Number): User ID for filtering assigned documents
   
      Response    : Returns object containing documents array with documentId, caseId, documentType, description, dateSubmitted, documentName, status, and pagination object with total, page, limit, totalPages
  */
  async getPendingDocuments(params) {
    return efilingDocumentService.getPendingDocuments(params);
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 14-11-2025 
      Description : Fetches e-filing history records by delegating to efilingHistoryService with pagination, search, and sorting capabilities
      Parameters  : 
          - params (Object): Query parameters for fetching history
              - page (Number): Page number for pagination (default: 1)
              - limit (Number): Number of items per page (default: 10)
              - searchValue (String): Optional search term for filtering history records
              - sortField (String): Field name to sort by (default: 'createdDate')
              - sortOrder (String): Sort order 'ASC' or 'DESC' (default: 'DESC')
              - userId (Number): User ID for filtering history records
   
      Response    : Returns object containing history array with id, created_date, created_time, description, createdBy, and pagination object with total, page, limit, totalPages
  */
  async getHistory(params) {
    return efilingHistoryService.getHistory(params);
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 14-11-2025 
      Description : Retrieves detailed information for a specific document including associated user and docket information
      Parameters  : 
          - documentId (Number): Unique identifier of the document to retrieve
   
      Response    : Returns document object containing id, documentName, documentType, description, filePath, status, dateSubmitted, PublicAccessUser object with user details, and Docket object with case information
  */
  async getDocumentDetails(documentId) {
    return efilingDocumentService.getDocumentDetails(documentId);
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 14-11-2025 
      Description : Reviews a document by approving or rejecting it, updates document status, creates history record, and sends email notifications to submitter and other case parties. Email failures are logged but do not block the review process
      Parameters  : 
          - params (Object): Review parameters
              - documentId (Number): ID of the document being reviewed
              - action (String): Review action - either 'approve' or 'reject'
              - userId (Number): ID of the user performing the review
              - rejectReason (String): Reason for rejection (required if action is 'reject')
              - documentTableData (Object): Additional document metadata to update
              - commonData (Object): Common data including caseid and documentActivity
              - history (Object): History record data with description
   
      Response    : Returns object containing externalDoc (updated document object), newStatus (the status that was set), and rejectReason (if applicable). Sends email notifications to document submitter, case parties, and eServices users
  */
  async reviewDocument(params) {
    // Review the document
    const result = await efilingDocumentService.reviewDocument(params);

    // Send email notifications
    try {
      const caseId = result.externalDoc.caseId || result.externalDoc.docketCaseId;
      await efilingNotificationService.documentStatusNotifyMail(caseId, {
        externalUserId: result.externalDoc.createdBy,
        internalUserId: params.userId,
        status: result.newStatus,
        documentName: result.externalDoc.documentName,
        rejectReason: result.rejectReason,
        documentActivity: params.commonData?.documentActivity, // Pass from frontend
      });
    } catch (emailError) {
      logger.error('Failed to send notification emails:', { 
        error: emailError.message, 
        documentId: result.externalDoc.id 
      });
    }

    // Create in-app notification for approved documents (getEfilingDocById equivalent)
    if (params.action.toLowerCase() === 'approve') {
      try {
        await efilingNotificationService.createEfilingDocNotification(
          params.documentId,
          null,
          params.userId
        );
      } catch (notificationError) {
        logger.error('Failed to create in-app notification:', {
          error: notificationError.message,
          documentId: params.documentId,
        });
      }
    }

    return result;
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 14-11-2025 
      Description : Fetches all documents associated with a specific case that are not approved and have been file scanned
      Parameters  : 
          - caseId (Number): Unique identifier of the case/docket to retrieve documents for
   
      Response    : Returns array of document objects containing documentId, documentType, dateSubmitted (formatted as MM-DD-YYYY), caseId, status, description, documentName, and isAddedFrom, sorted by dateSubmitted in descending order
  */
  async getCaseDocuments(caseId) {
    return efilingDocumentService.getCaseDocuments(caseId);
  }
}

export default new EfilingService();
