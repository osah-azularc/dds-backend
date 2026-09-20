import JudgeAssistantClerk from "../models/JudgeAssistantClerk.js";
import DocumentTypes from "../models/case/documentTypeModel.js";
import ExternalDocuments from "../models/ExternalDocuments.js";
import { Op } from "sequelize";
import { logger } from "../../config/winstonLogger.js";

/*
  Name: getCmaList
  Date Created: Current Date
  Description: Fetch all active CMAs (Court Management Assistants) from judge_assistant_clerk table
*/
export const getCmaList = async (req, res) => {
  try {
    const cmaList = await JudgeAssistantClerk.findAll({
      where: {
        user_type: "cma",
        is_active: "1",
        user_id: {
          [Op.ne]: 264,
        },
      },
      attributes: ["user_id", "FirstName", "LastName", "email", "phone"],
      order: [
        ["LastName", "ASC"],
        ["FirstName", "ASC"],
      ],
      raw: true,
    });

    return res.status(200).json({
      status: 200,
      message: "CMA list fetched successfully",
      data: cmaList,
      success: true,
    });
  } catch (error) {
    logger.error("Error in getCmaList:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch CMA list",
      message: "CMA list is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name: getExternalDocumentTypes
  Date Created: Current Date
  Description: Fetch all external document types from documenttypes table
*/
export const getExternalDocumentTypes = async (req, res) => {
  try {
    const documentTypes = await DocumentTypes.findAll({
      where: {
        public_access_flag: "1",
      },
      attributes: ["id", "documenttype", "public_access_flag"],
      order: [["documenttype", "ASC"]],
      raw: true,
    });

    const formattedDocumentTypes = documentTypes.map((docType) => ({
      id: docType.id,
      title: docType.documenttype,
      documenttype: docType.documenttype,
      public_access_flag: docType.public_access_flag,
    }));

    return res.status(200).json({
      status: 200,
      message: "Document types fetched successfully",
      data: formattedDocumentTypes,
      success: true,
    });
  } catch (error) {
    logger.error("Error in getExternalDocumentTypes:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch document types",
      message:
        "Document types is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

const ALLOWED_ORDER_COLUMNS = {
  document_name: "documentName",
  document_type: "documentType",
  caseid: "caseId",
  date_submitted: "dateSubmitted",
};

/*
  Name: getAllPendingDocuments
  Date Created: Current Date
  Description: Fetch all pending external documents with filtering, pagination, and sorting
*/
export const getAllPendingDocuments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const requestedLimit = parseInt(req.query?.limit, 10) || 10;
    const limit = Math.min(Math.max(1, requestedLimit), 100);
    const offset = (page - 1) * limit;

    const assignedTo = req.query?.assignedTo?.toString()?.trim();
    const documentType = req.query?.documentType?.toString()?.trim();
    const dateFrom = req.query?.dateFrom;
    const dateTo = req.query?.dateTo;

    const orderColumn =
      ALLOWED_ORDER_COLUMNS[req.query?.sortBy] || "dateSubmitted";
    const orderDirection =
      String(req.query?.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

    let whereClause = {
      status: "Pending",
    };

    if (assignedTo) {
      whereClause.assignedTo = parseInt(assignedTo, 10);
    }

    if (documentType) {
      whereClause.documentType = documentType;
    }

    if (dateFrom || dateTo) {
      whereClause.dateSubmitted = {};

      if (dateFrom) {
        whereClause.dateSubmitted[Op.gte] = new Date(dateFrom);
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        whereClause.dateSubmitted[Op.lt] = endDate;
      }
    }

    const { count, rows: documents } = await ExternalDocuments.findAndCountAll({
      where: whereClause,
      attributes: [
        "documentId",
        "caseId",
        "documentType",
        "dateSubmitted",
        "documentName",
      ],
      order: [
        [orderColumn, orderDirection],
        ["documentId", "ASC"],
      ],
      limit,
      offset,
      raw: true,
      subQuery: false,
    });

    const formattedDocuments = documents.map((doc) => ({
      document_id: doc.documentId,
      caseid: doc.caseId,
      document_type: doc.documentType,
      date_submitted: doc.dateSubmitted
        ? new Date(doc.dateSubmitted).toLocaleDateString("en-CA")
        : null,
      document_name: doc.documentName,
    }));

    return res.status(200).json({
      status: 200,
      message: "Pending documents fetched successfully",
      data: formattedDocuments,
      success: true,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Error in getAllPendingDocuments:", error);

    return res.status(500).json({
      status: 500,
      title: "Unable to fetch pending documents",
      message:
        "Pending documents are unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name: updateCma
  Date Created: Current Date
  Description: Update CMA assignment for external documents
*/
export const updateCma = async (req, res) => {
  try {
    const { documentId, assigned_to } = req.body;

    if (!documentId || !assigned_to) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields: documentId or assigned_to",
        success: false,
      });
    }

    const docIds = documentId;
    const currentDateTime = new Date();

    const updateResult = await ExternalDocuments.update(
      {
        assignedTo: assigned_to,
        reassignedFlag: "1",
        modifiedDate: currentDateTime,
      },
      {
        where: {
          documentId: {
            [Op.in]: docIds,
          },
        },
      },
    );

    if (updateResult[0] > 0) {
      return res.status(200).json({
        status: 1,
        message:
          "Thank you! You have updated the CMA who is reviewing the documents.",
        success: true,
        updatedCount: updateResult[0],
      });
    } else {
      return res.status(404).json({
        status: 404,
        message: "No documents found to update",
        success: false,
      });
    }
  } catch (error) {
    logger.error("Error in updateCma", error);
    return res.status(500).json({
      status: 500,
      message: "Exception occurred during processing",
      success: false,
      error: error.message,
    });
  }
};
