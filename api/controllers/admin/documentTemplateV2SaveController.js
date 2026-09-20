import { mysqlSequelize } from "../../../connections/seqDB.js";
import { getTempFilePath } from "../../../helpers/templateTempStorage.js";
import { copyTempTemplateToEfs } from "../../services/documentTemplates/storage/efsTemplateStorageService.js";
import { logger } from "../../../config/winstonLogger.js";
import { parseAndValidateTemplateV2Mappings } from "./helpers/templateV2MappingValidation.js";
import DocumentTemplates from "../../models/admin/documentTemplatesModel.js";
import {
  insertTemplateMappingRows,
  SCOPE_TYPE_DECISION,
  SCOPE_TYPE_GENERAL,
  SCOPE_TYPE_BOTH,
} from "./helpers/templateV2MappingInserter.js";

/**
 * Save Document Template V2
 * Persists template header + mapping rows (agency/casetype) + optional automation.
 *
 * File source: the .docx is already on disk in backend/tmp/templates/{tempId}.docx
 * from the earlier POST /admin/uploadTemplateTemp call (Slice 2).
 * This endpoint accepts tempId + tempFileName from req.body (JSON).
 * No file upload, no S3/EFS interaction — temp file stays in place until EFS migration.
 */
export const saveDocumentTemplateV2 = async (req, res) => {
  const user_id = req.user?.userId || req.userId || req.user?.id || null;
  if (!user_id) {
    return res.status(401).json({
      status: 401,
      title: "Authentication required",
      message: "User ID could not be determined. Please log in again.",
      success: false,
    });
  }

  
  const {
    templateName,
    documentType,
    scopeType,
    status,
    dateFormat,
    mappings,
    tempId,
    tempFileName,
  } = req.body;

  const normalizedTemplateName = typeof templateName === "string" ? templateName.trim() : "";
  const normalizedDocumentType = typeof documentType === "string" ? documentType.trim() : "";
  const normalizedDateFormat = typeof dateFormat === "string" ? dateFormat.trim() : "";
  const scopeTypeValue = Number(scopeType);
  const activeStatus = String(status) === "0" ? "0" : "1";

  if (!normalizedTemplateName || !normalizedDocumentType) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Template name and document type are required.",
      success: false,
    });
  }

  if (![SCOPE_TYPE_DECISION, SCOPE_TYPE_GENERAL, SCOPE_TYPE_BOTH].includes(scopeTypeValue)) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Scope type is invalid.",
      success: false,
    });
  }

  if (!tempId || typeof tempId !== "string" || !tempId.trim()) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "A valid tempId is required. Please select a template file before saving.",
      success: false,
    });
  }

  const originalFileName = typeof tempFileName === "string" ? tempFileName.trim() : "";
  if (!originalFileName || !originalFileName.toLowerCase().endsWith(".docx")) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "A valid .docx tempFileName is required.",
      success: false,
    });
  }

  if (!normalizedDateFormat || !["english", "spanish"].includes(normalizedDateFormat)) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Date format must be english or spanish.",
      success: false,
    });
  }

  const mappingValidation = parseAndValidateTemplateV2Mappings({
    mappings,
    scopeTypeValue,
    scopeTypeDecision: SCOPE_TYPE_DECISION,
    scopeTypeBoth: SCOPE_TYPE_BOTH,
  });
  if (!mappingValidation.ok) {
    return res.status(mappingValidation.response.status).json(mappingValidation.response);
  }
  const { normalizedMappings } = mappingValidation;

  // Pre-flight duplicate check before EFS write — prevents orphaned EFS files on a save
  // that would be rejected by the DB constraint.
  const preflightCheck = await DocumentTemplates.findOne({
    where: { documentname: originalFileName },
    attributes: ["id"],
  });
  if (preflightCheck) {
    return res.status(409).json({
      status: 409,
      title: "Duplicate file name",
      message: `A template with filename "${originalFileName}" already exists. Please rename the file or edit the existing template.`,
      success: false,
    });
  }

  // Persist DOCX to EFS — all validation passed, safe to write.
  try {
    const tempFilePath = getTempFilePath(tempId);
    await copyTempTemplateToEfs(tempFilePath, originalFileName);
  } catch (error) {
    logger.error("[saveDocumentTemplateV2] EFS copy failed", {
      tempId,
      originalFileName,
      error: error.message,
    });
    return res.status(500).json({
      status: 500,
      title: "EFS persistence failed",
      message: "The template file could not be saved to EFS.",
      success: false,
    });
  }

  const transaction = await mysqlSequelize.transaction();

  try {
    // In-transaction duplicate guard (race condition safety only — preflight above handles the common case)
    const existingTemplate = await DocumentTemplates.findOne({
      where: { documentname: originalFileName },
      attributes: ["id"],
      transaction,
    });
    if (existingTemplate) {
      await transaction.rollback();
      return res.status(409).json({
        status: 409,
        title: "Duplicate file name",
        message: `A template with filename "${originalFileName}" already exists. Please rename the file or edit the existing template.`,
        success: false,
      });
    }

    const now = new Date();
    const isSpanishDoc = normalizedDateFormat === "spanish" ? "1" : "0";

    const templateInstance = await DocumentTemplates.create(
      {
        documentname: originalFileName,
        documenttype: normalizedDocumentType,
        displayname: normalizedTemplateName,
        isSpanishdoc: isSpanishDoc,
        active: activeStatus,
        scopeType: scopeTypeValue,
        createdDate: now,
        modifiedDate: now,
        createdBy: user_id,
        modifiedBy: user_id,
      },
      { transaction }
    );

    await insertTemplateMappingRows({
      templateId: templateInstance.id,
      normalizedMappings,
      scopeTypeValue,
      normalizedTemplateName,
      user_id,
      transaction,
      now,
    });

    await transaction.commit();

    return res.status(200).json({
      status: 200,
      message: "Document template saved successfully",
      success: true,
      data: { templateId: templateInstance.id },
    });
  } catch (error) {
    await transaction.rollback();

    if (error.name === "SequelizeUniqueConstraintError" || error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        status: 409,
        title: "Duplicate entry",
        message: "A template with this filename already exists. Please use a different filename.",
        success: false,
      });
    }

    return res.status(500).json({
      status: 500,
      title: "Unable to save document template",
      message: "The document template could not be saved at this time.",
      success: false,
    });
  }
};
