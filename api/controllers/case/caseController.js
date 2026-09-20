import ExternalDocuments from "../../models/ExternalDocuments.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import AttachmentPaths from "../../models/AttachmentPathsModel.js";
import DocumentsTable from "../../models/DocumentsTableModel.js";
import { Sequelize } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Author: Rizwan Hiroli
 * Created: 25/04/25
 * Preview th document from the list of document acitivities.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object.
 */
export const documentPreview = async (req, res) => {
  try {
    const payload = req.body;
    let result = null;

    // Fetch data based on the `status` field
    if (payload.status === "Approved") {
      const documentId = { documentid: payload.documentId }; // Map to match database schema
      result = await previewApprovedDocument(documentId); // Query for approved documents
    } else if (payload.status === "Pending" || payload.status === "Rejected") {
      const documentId = { document_id: payload.documentId }; // Map to match database schema
      result = await previewExternalDocument(documentId); // Query for external documents
    }

    // Return the response
    return res.status(200).json({
      response: result || "No data found",
    });
  } catch (error) {
    logger.error("Error in documentPreview:", error);
    return res.status(500).json({
      error: error.message || "An error occurred while processing the request",
    });
  }
};

/**
 * Get the documents approved in the system.
 * @param {*} request
 * @returns
 */
export const previewApprovedDocument = async (request) => {
  try {
    // Use Sequelize model query to fetch the document details
    const document = await DocumentsTable.findOne({
      where: { documentid: request.documentid }, // Filter by documentid
      attributes: [
        ["documentid", "document_id"],
        ["DocumentType", "document_type"],
        [
          Sequelize.fn(
            "DATE_FORMAT",
            Sequelize.col("DateRequested"),
            "%m-%d-%Y",
          ),
          "date_submitted",
        ],
        ["Description", "description"],
        ["DocumentName", "document_name"],
        "caseid",
        "created_by",
      ],
      include: [
        {
          model: AttachmentPaths,
          as: "attachmentPath", // Alias for the join
          attributes: [["attachmentpath", "document_file_path"]],
          required: false, // Left join
        },
        {
          model: JudgeAssistantClerk,
          as: "createdByJudgeAssistantClerk", // Alias for the join
          attributes: [["FirstName", "firstname"]],
          required: false, // Left join
        },
      ],
    });

    // Return the document or null if not found
    return document || null;
  } catch (error) {
    logger.error("Error in previewApprovedDocument:", error.message);
    throw error;
  }
};

/**
 * Get the pending/rejected documents in the system.
 * @param {*} request
 * @returns
 */
export const previewExternalDocument = async (request) => {
  try {
    // Use Sequelize model query to fetch the document details
    const document = await ExternalDocuments.findOne({
      where: { document_id: request.document_id }, // Filter by document_id
      attributes: [
        "document_id",
        "document_type",
        [
          Sequelize.fn(
            "DATE_FORMAT",
            Sequelize.col("date_submitted"),
            "%m-%d-%Y",
          ),
          "date_submitted",
        ],
        "description",
        "document_name",
        "document_file_path",
        "caseid",
        "created_by",
      ],
      include: [
        {
          model: PublicAccessUser,
          as: "PublicAccessUser", // Alias for the join
          attributes: ["firstname"], // Fetch only the firstname from the user
          required: false, // Left join
        },
      ],
    });

    // Return the document or null if not found
    return document || null;
  } catch (error) {
    logger.error("Error in previewExternalDocument:", error.message);
    throw error;
  }
};
