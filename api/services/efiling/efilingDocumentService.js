import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import DocumentsTable from "../../models/DocumentsTableModel.js";
import AttachmentPaths from "../../models/AttachmentPathsModel.js";
import DocumentActivity from "../../models/DocumentActivity.js";
import ExternalDocuments from "../../models/ExternalDocuments.js";
import EfilingHistory from "../../models/EfilingHistory.js";
import History from "../../models/History.js";
import { Op, Sequelize } from "sequelize";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import Docket from "../../models/Docket.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import fs from "fs";
import fileOperationsService from "./fileOperationsService.js";
import { logger } from '../../../config/winstonLogger.js';
import path from 'path';
import { CaseTypeStyling, caseTypes as CaseTypes } from "../../models/index.js";

/**
 * E-Filing Document Service
 * Handles document-specific operations (CRUD, review, approval)
 */
class EfilingDocumentService {
  /**
   * Fetch pending documents with pagination and search
   */
  async getPendingDocuments({ page = 1, limit = 10, searchValue = "", sortField = "dateSubmitted", sortOrder = "DESC", userId }) {
    const whereClause = {
      status: "Pending",
      assignedTo: userId,
    };

    if (searchValue) {
      const searchConditions = [
        { documentName: { [Op.like]: `%${searchValue}%` } },
        { documentType: { [Op.like]: `%${searchValue}%` } },
        { description: { [Op.like]: `%${searchValue}%` } },
        { caseId: { [Op.like]: `%${searchValue}%` } },
        mysqlSequelize.where(
          mysqlSequelize.fn('DATE_FORMAT', mysqlSequelize.col('date_submitted'), '%m-%d-%Y'),
          { [Op.like]: `%${searchValue}%` }
        ),
      ];

      // Handle "Yes"/"No" search for reassignedFlag
      const lowerSearch = searchValue.toLowerCase();
      if (lowerSearch === 'yes') {
        searchConditions.push({ reassignedFlag: '1' });
      } else if (lowerSearch === 'no') {
        searchConditions.push({ reassignedFlag: '0' });
      } else {
        searchConditions.push({ reassignedFlag: { [Op.like]: `%${searchValue}%` } });
      }

      whereClause[Op.or] = searchConditions;
    }

    const { count: totalPendingDocuments, rows: pendingDocumentsList } = await ExternalDocuments.findAndCountAll({
      where: whereClause,
      order: [[sortField, sortOrder]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      attributes: [
        "documentId",
        "caseId",
        "documentType",
        "description",
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("date_submitted"), "%m-%d-%Y"), "dateSubmitted"],
        "documentName",
        "status",
        "reassignedFlag",
      ],
    });

    return {
      documents: pendingDocumentsList.map(doc => ({
        ...doc.toJSON(),
        reassigned: doc.reassignedFlag === '1' ? 'Yes' : 'No',
      })),
      pagination: {
        total: totalPendingDocuments,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalPendingDocuments / parseInt(limit)),
      },
    };
  }

  /**
   * Fallback to fetch petitioner/respondent from casetypestyling table
   * Mirrors PHP: getDataFromCasetypestylingTable()
   */
  async getDataFromCasetypestylingTable(casetype, refagency) {
    const stylingData = await CaseTypeStyling.findOne({
      include: [
        {
          model: CaseTypes,
          as: 'caseType',
          where: {
            CaseCode: casetype,
            Agencycode: refagency,
          },
          attributes: [],
        },
      ],
      attributes: ['petitioner', 'respondent'],
    });

    return stylingData ? stylingData.toJSON() : null;
  }

  /**
   * Format person name from styling data (fallback)
   * @param {string} fullName - Full name from casetypestyling
   * @returns {Object|null} Formatted person object or null
   */
  formatStylingName(fullName) {
    if (!fullName) return null;

    return {
      fullName: fullName,
    };
  }

  /**
   * Format person name from PeopleDetails
   * @param {Object} personData - Person data from PeopleDetails
   * @returns {Object|null} Formatted person object or null
   */
  formatPersonName(personData) {
    if (!personData) return null;

    return {
      peopleId: personData.peopleId,
      firstName: personData.Firstname,
      lastName: personData.Lastname,
      fullName: `${personData.Lastname || ''}, ${personData.Firstname || ''}`.trim(),
    };
  }

  /**
   * Create petitioner and respondent objects from PeopleDetails data
   * @param {Object} petitionerData - Petitioner data from PeopleDetails
   * @param {Object} respondentData - Respondent data from PeopleDetails
   * @returns {Object} Object containing formatted petitioner and respondent
   */
  createPartiesObjects(petitionerData, respondentData) {
    const petitioner = this.formatPersonName(petitionerData);
    const respondent = this.formatPersonName(respondentData);

    return { petitioner, respondent };
  }

  /**
   * Build petitioner and respondent objects from docket data
   * @param {Object} docketData - Docket data with PetitionerDetails and RespondentDetails
   * @returns {Object} Object containing petitioner and respondent
   */
  async buildPartiesFromDocket(docketData) {
    let petitioner = null;
    let respondent = null;

    if (!docketData) {
      return { petitioner, respondent };
    }

    const petitionerData = docketData.PetitionerDetails?.[0];
    const respondentData = docketData.RespondentDetails?.[0];

    // Create petitioner and respondent objects from PeopleDetails
    ({ petitioner, respondent } = this.createPartiesObjects(petitionerData, respondentData));

    // Fallback to casetypestyling if petitioner or respondent is missing
    if ((!petitioner || !respondent) && docketData.casetype && docketData.refagency) {
      const stylingData = await this.getDataFromCasetypestylingTable(
        docketData.casetype,
        docketData.refagency
      );

      if (stylingData) {
        if (!petitioner && stylingData.petitioner) {
          petitioner = this.formatStylingName(stylingData.petitioner);
        }
        if (!respondent && stylingData.respondent) {
          respondent = this.formatStylingName(stylingData.respondent);
        }
      }
    }

    return { petitioner, respondent };
  }

  /**
   * Get document details with all related information
   */
  async getDocumentDetails(documentId) {
    const documentRecord = await ExternalDocuments.findOne({
      where: { documentId },
      attributes: [
        "documentId",
        "caseId",
        "documentType",
        "documentName",
        "description",
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("date_submitted"), "%m-%d-%Y"), "dateSubmitted"],
        "timeSubmitted",
        "reassignedFlag",
        "status",
        "documentFilePath",
        "createdBy",
      ],
      include: [
        {
          model: PublicAccessUser,
          as: "PublicAccessUser",
          attributes: ["userId", "firstname", "lastname", "email"],
          required: false,
        },
        {
          model: Docket,
          as: "Docket",
          attributes: ["caseId", "docketNumber", "status", "casetype", "refagency"],
          required: false,
          include: [
            {
              model: PeopleDetails,
              as: "PetitionerDetails",
              attributes: ["peopleId", "Firstname", "Lastname"],
              required: false,
              limit: 1,
            },
            {
              model: PeopleDetails,
              as: "RespondentDetails",
              attributes: ["peopleId", "Firstname", "Lastname"],
              required: false,
              limit: 1,
            },
          ],
        },
      ],
      subQuery: false,
    });

    if (!documentRecord) {
      return null;
    }

    const documentDetails = documentRecord.toJSON();

    // Build docket information
    if (documentDetails.Docket) {
      const { petitioner, respondent } = await this.buildPartiesFromDocket(documentDetails.Docket);
      documentDetails.Docket.petitioner = petitioner;
      documentDetails.Docket.respondent = respondent;
    }

    return {
      documentId: documentDetails.documentId,
      caseId: documentDetails.caseId,
      documentType: documentDetails.documentType,
      documentName: documentDetails.documentName,
      reassignedFlag: documentDetails.reassignedFlag,
      description: documentDetails.description,
      dateSubmitted: documentDetails.dateSubmitted,
      timeSubmitted: documentDetails.timeSubmitted,
      status: documentDetails.status,
      documentFilePath: documentDetails.documentFilePath,
      createdBy: documentDetails.createdBy,
      submitter: documentDetails.PublicAccessUser ? {
        userId: documentDetails.PublicAccessUser.userId,
        firstname: documentDetails.PublicAccessUser.firstname,
        lastname: documentDetails.PublicAccessUser.lastname,
        email: documentDetails.PublicAccessUser.email,
        fullName: `${documentDetails.PublicAccessUser.lastname || ''}, ${documentDetails.PublicAccessUser.firstname || ''}`.trim(),
      } : null,
      docket: documentDetails.Docket ? {
        caseId: documentDetails.Docket.caseId,
        docketNumber: documentDetails.Docket.docketNumber,
        status: documentDetails.Docket.status,
        petitioner: documentDetails.Docket.petitioner,
        respondent: documentDetails.Docket.respondent,
      } : null,
    };
  }

  /**
   * Get case documents
   */
  async getCaseDocuments(caseId) {
    const documents = await ExternalDocuments.findAll({
      where: {
        caseId,
        status: { [Op.ne]: "Approved" },
        isFileScanned: "1",
      },
      attributes: [
        "documentId",
        "documentType",
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("date_submitted"), "%m-%d-%Y"), "dateSubmitted"],
        "caseId",
        "status",
        "description",
        "documentName",
        "isAddedFrom",
      ],
      order: [["dateSubmitted", "DESC"]],
    });

    return documents;
  }

  /**
   * Review document (approve/reject)
   */
  async reviewDocument({ documentId, action, documentTableData, commonData, history, rejectReason, userId }) {
    const transaction = await mysqlSequelize.transaction();

    try {
      const externalDoc = await ExternalDocuments.findByPk(documentId, { transaction });

      if (!externalDoc) {
        throw new Error("Document not found");
      }

      if (action.toLowerCase() === "approve") {
        await this.approveDocument({ externalDoc, documentTableData, commonData, userId, transaction });
      } else {
        await this.rejectDocument({ externalDoc, documentTableData, commonData, rejectReason, userId, transaction });
      }

      // Legacy parity: docket-scoped history row (surfaces on the docket "History" tab)
      await this.createDocketHistoryRow({ externalDoc, action, userId, transaction });

      await EfilingHistory.create({
        description: history.description || `Document ${action}ed by user ${userId}`,
        createdBy: userId,
        createdDate: new Date(),
      }, { transaction });

      await transaction.commit();

      return {
        success: true,
        message: `Document ${action}ed successfully`,
        documentId,
        externalDoc: externalDoc.toJSON(),
        newStatus: action.toLowerCase() === "approve" ? "Approved" : "Rejected",
        rejectReason,
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error in reviewDocument service:', { 
        documentId, 
        action, 
        userId, 
        error: error.message, 
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Insert a docket-scoped history row mirroring legacy EfilingController::addHistory().
   * Produces the HTML entry that appears on the docket "History" tab after an e-filing
   * document is approved or rejected. Runs inside the caller's transaction.
   */
  async createDocketHistoryRow({ externalDoc, action, userId, transaction }) {
    const reviewer = await JudgeAssistantClerk.findOne({
      where: { userId },
      attributes: ['FirstName', 'LastName'],
      raw: true,
      transaction,
    });
    const submitter = externalDoc.createdBy
      ? await PublicAccessUser.findOne({
          where: { userId: externalDoc.createdBy },
          attributes: ['firstName', 'lastName'],
          raw: true,
          transaction,
        })
      : null;

    const isApprove = action.toLowerCase() === 'approve';
    const docType = externalDoc.documentType || '';
    const text = docType === 'Entry Of Appearance'
      ? 'An entry of appearance document'
      : 'A document';
    const statusText = isApprove ? 'approved and filed by ' : 'rejected by ';
    const cmaName = reviewer
      ? `${reviewer.FirstName || ''} ${reviewer.LastName || ''}`.trim()
      : '';
    const partyName = submitter
      ? `${submitter.firstName || ''} ${submitter.lastName || ''}`.trim()
      : '';

    const dateSubmittedFormatted = externalDoc.dateSubmitted
      ? new Date(externalDoc.dateSubmitted).toLocaleDateString('en-US', {
          month: '2-digit', day: '2-digit', year: 'numeric',
        }).replace(/\//g, '-')
      : '';

    const description = [
      `<p class="history-title">${text} submitted by ${partyName} has been ${statusText}${cmaName}.</p>`,
      `<p><span class="history-label">File Attachment Name:</span><span class="history-data">${externalDoc.documentName || ''}</p>`,
      `<p><span class="history-label">Document Type:</span><span class="history-data">${docType}</p></span></p>`,
      `<p><span  class="history-label">Description:</span><span class="history-data">${externalDoc.description || ''}</p>`,
      `<p><span class="history-label">Date Filed:</span><span class="history-data">${dateSubmittedFormatted}</p>`,
    ].join('');

    const modifiedBy = reviewer
      ? `${reviewer.LastName || ''}, ${reviewer.FirstName || ''}`.replace(/^, |, $/g, '').trim()
      : '';
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8); // HH:MM:SS

    await History.create({
      caseId: externalDoc.caseId,
      docketCaseId: externalDoc.caseId,
      description,
      modifiedBy,
      date: now,
      createdTime: timeStr,
    }, { transaction });
  }

  /**
   * Approve document - extracted from reviewDocument
   */
  async approveDocument({ externalDoc, documentTableData, commonData, userId, transaction }) {
    
    const caseId = documentTableData.Caseid || commonData.caseid;
    const documentType = documentTableData.document_type || externalDoc.documentType;
    const documentName = documentTableData.document_name || externalDoc.documentName;
    const description = documentTableData.description || externalDoc.description;
    const webPath = externalDoc.documentFilePath;

    if (!caseId || !documentType || !documentName || !webPath) {
      throw new Error("Missing required fields for document approval");
    }

    // Fetch user details using Sequelize model
    const userDetails = await JudgeAssistantClerk.findOne({
      where: { userId: userId },
      attributes: ['FirstName', 'LastName'],
      raw: true,
      transaction
    });
    
    const username = userDetails 
      ? `${userDetails.LastName}, ${userDetails.FirstName}` 
      : 'Unknown User';

    // Convert web path to filesystem path
    const nodeEnv = process.env.NODE_ENV || 'local';
    let sourcePath;

    if (['dev', 'stag', 'uat', 'prod'].includes(nodeEnv)) {
      sourcePath = path.join(process.env.EFS_BASE_PATH, webPath);
    } else {
      sourcePath = path.join(process.cwd(), 'public', webPath);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    const { filePath: newFilePath, relativePath } = fileOperationsService.generateApprovedDocumentPath(
      caseId, 
      documentType, 
      documentName
    );

    await fileOperationsService.copyFileLocal(sourcePath, newFilePath);
    
    // Combine and format submitted date and time to match required format
    const submittedDateTimeString = `${externalDoc.dateSubmitted} ${externalDoc.timeSubmitted}`;
    const submittedDateTime = new Date(submittedDateTimeString);
    const formattedSubmittedDateTime = fileOperationsService.formatDateTime(submittedDateTime);
    
    // Pass complete stamp data with user's full name
    await fileOperationsService.addTimestampToFile(newFilePath, { 
      dateSubmitted: formattedSubmittedDateTime,
      username: username,
      userId,
      action: 'Approved',
      documentType 
    });

    const newDocument = await DocumentsTable.create({
      Caseid: caseId,
      Docket_caseid: documentTableData.Docket_caseid || caseId,
      DocumentType: documentType,
      Description: description,
      DocumentName: documentName,
      DateRequested: documentTableData.DateRequested || externalDoc.dateSubmitted,
      status: documentTableData.status || 'Pending',
      form_status_desc: documentTableData.form_status_desc,
      assigned_to: documentTableData.assigned_to,
      created_by: userId,
      modified_by: userId,
      created_date: new Date(),
      modified_date: new Date(),
    }, { transaction });

    await AttachmentPaths.create({
      documentId: newDocument.documentid,
      attachmentPath: relativePath,
    }, { transaction });

    await DocumentActivity.create({
      document_id: newDocument.documentid,
      caseid: caseId,
      activity_desc: commonData.documentActivity || 'Document Approved from E-Filing',
      status: 'Approved',
      user_id: externalDoc.createdBy,
      created_by: userId,
      modified_by: userId,
      created_at: new Date(),
      modified_at: new Date(),
    }, { transaction });

    await externalDoc.update({
      status: 'Approved',
      reviewedBy: userId,
      reviewedAt: new Date(),
    }, { transaction });

    if (commonData.caseid) {
      await DocumentActivity.create({
        document_id: externalDoc.documentId,
        caseid: commonData.caseid,
        activity_desc: commonData.documentActivity,
        status: 'Approved',
        user_id: externalDoc.createdBy,
        created_by: userId,
        modified_by: userId,
        created_at: new Date(),
        modified_at: new Date(),
      }, { transaction });
    }
  }

  /**
   * Reject document - extracted from reviewDocument
   */
  async rejectDocument({ externalDoc, documentTableData, commonData, rejectReason, userId, transaction }) {
    // Legacy parity: rejection reason is stored in form_status_desc — that's the
    // column getRejectedPendingDocumentsData reads to surface the reason in the UI.
    const reason = rejectReason || documentTableData?.form_status_desc || '';

    await externalDoc.update({
      status: 'Rejected',
      formStatusDesc: reason,
    }, { transaction });

    if (commonData.caseid) {
      await DocumentActivity.create({
        document_id: externalDoc.documentId,
        caseid: commonData.caseid,
        activity_desc: commonData.documentActivity || `Document Rejected: ${rejectReason}`,
        status: 'Rejected',
        user_id: userId,
        created_by: userId,
        modified_by: userId,
        created_at: new Date(),
        modified_at: new Date(),
      }, { transaction });
    }
  }
}

export default new EfilingDocumentService();





