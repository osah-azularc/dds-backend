import DocumentType from "../../models/case/documentTypeModel.js";
import { validateDocumentType } from "../../../helpers/validation.js";
import {
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from "../../constants/constant-messages.js";
import { insertModuleAuditLog } from "../../helpers/auditLogs.helper.js";
import { Op } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";
const documentTypeModuleNames = [AUDIT_LOG_MODULE_NAME.DOCUMENT_TYPES];

//File Type & Document Type is used as interchangeably
export const getAllDocumentType = async (req, res) => {
  try {
    const documentTypeData = await DocumentType.findAll({
      where: { is_active: "1" },
      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      status: 200,
      message: "File type data fetched successfully",
      data: documentTypeData,
      success: true,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createDocumentType = async (req, res) => {
  const { name, eFiling_availability } = req.body;
  const user_id = req.userId;
  try {
    const validationErrors = await validateDocumentType(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to add File Type",
        message: validationErrors,
        success: false,
      });
    }

    const newDocumentType = await DocumentType.create({
      name,
      document_category_id: "", // documentCategoryName.dataValues.id,
      eFiling_availability,
      created_by: user_id,
      created_date: new Date(),
    });

    // AUDIT LOG FOR CREATE DOCUMENT TYPE : START
    if (newDocumentType) {
      const { name, document_category_id, eFiling_availability } =
        newDocumentType.dataValues;
      const documentTypeCreatedData = {
        name,
        document_category_id,
        eFiling_availability,
      };
      for (const moduleName of documentTypeModuleNames) {
        for (const [key, value] of Object.entries(documentTypeCreatedData)) {
          insertModuleAuditLog(
            user_id,
            AUDIT_LOG_ACTIONS.CREATED,
            `{{User}} created ${name}`,
            moduleName,
            key,
            newDocumentType.dataValues.id,
            "",
            value,
            "",
          );
        }
      }
    }
    // AUDIT LOG FOR CREATE DOCUMENT TYPE : END
    return res.json(newDocumentType);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateDocumentType = async (req, res) => {
  let { id, name, document_category_id, eFiling_availability } = req.body;
  const user_id = req.userId;
  if (name) {
    name = name.trim();
  }
  try {
    if (id && id > 0) {
      const updateData = {
        name,
        document_category_id,
        eFiling_availability,
        updated_by: user_id,
        updated_date: new Date(),
      };
      const originalData = await DocumentType.findByPk(id, {
        attributes: ["name", "document_category_id", "eFiling_availability"],
      });

      const changes = {};
      const updatedData = { ...updateData };
      delete updatedData.updated_by;
      delete updatedData.updated_date;
      for (const key in updatedData) {
        if (
          updatedData.hasOwnProperty(key) &&
          originalData[key] != updatedData[key]
        ) {
          changes[key] = {
            original: originalData[key] ?? "",
            updated: updatedData[key] ?? "",
          };
        }
      }
      const updatedDocumentType = await DocumentType.update(updateData, {
        where: { id: id },
      });

      // AUDIT LOG FOR UPDATE DOCUMENT TYPE : START
      if (changes && updatedDocumentType) {
        for (const moduleName of documentTypeModuleNames) {
          for (const [key, value] of Object.entries(changes)) {
            await insertModuleAuditLog(
              user_id,
              AUDIT_LOG_ACTIONS.EDITED,
              `{{User}} edited ${updatedData.name}`,
              moduleName,
              key,
              id,
              value.original,
              value.updated,
              "",
            );
          }
        }
      }
      // AUDIT LOG FOR UPDATE DOCUMENT TYPE : END

      return res.status(200).json({
        status: 200,
        message: "File Type successfully updated",
        data: updatedDocumentType,
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to update File Type",
      message:
        "The File Type could not be updated this time. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to update File Type",
      message:
        "The File Type could not be updated this time. Please try again.",
      success: false,
    });
  }
};

export const checkDocumentTypeExists = async (req, res) => {
  const { name } = req.body;
  try {
    const documentType = await DocumentType.findOne({
      where: {
        name: {
          [Op.iLike]: name, // Case-insensitive comparison
        },
        is_active: "1",
      },
    });

    if (documentType) {
      return res.status(200).json({ success: true, exists: true });
    } else {
      return res.status(200).json({ success: true, exists: false });
    }
  } catch (error) {
    logger.error("Failed to check File Type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteDocumentType = async (req, res) => {
  const { id, is_active } = req.body;
  const user_id = req.userId;

  try {
    // If no active templates are associated, proceed to update the file_type
    await DocumentType.update(
      {
        is_active,
        updated_by: user_id,
        updated_date: new Date(),
      },
      { where: { id } },
    );
    const deletedDocumentType = await DocumentType.findByPk(id);

    if (deletedDocumentType) {
      for (const moduleName of documentTypeModuleNames) {
        insertModuleAuditLog(
          user_id,
          AUDIT_LOG_ACTIONS.DELETED,
          `{{User}} deleted ${deletedDocumentType.name} from File Type`,
          moduleName,
          "is_active",
          id,
          is_active === "1" ? "0" : "1",
          is_active,
          "",
        );
      }
    }

    return res.status(200).json({
      status: 200,
      message: "File Type successfully deleted",
      data: deletedDocumentType,
      success: true,
    });
  } catch (error) {
    logger.error("Error deleting File Type:", error);

    return res.status(500).json({
      status: 500,
      title: "Unable to delete File Type",
      message:
        "The file type could not be deleted at this time. Please try again.",
      success: false,
    });
  }
};
