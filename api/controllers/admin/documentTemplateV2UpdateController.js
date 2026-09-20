import { mysqlSequelize } from "../../../connections/seqDB.js";
import { logger } from "../../../config/winstonLogger.js";
import { Op } from "sequelize";
import { parseAndValidateTemplateV2Mappings } from "./helpers/templateV2MappingValidation.js";
import DocumentTemplates from "../../models/admin/documentTemplatesModel.js";
import DocumentTemplateCasetypeMapping from "../../models/admin/documentTemplateCasetypeMappingModel.js";
import DocumentTemplateMappingAutomation from "../../models/admin/documentTemplateMappingAutomationModel.js";
import {
  insertTemplateMappingRows,
  SCOPE_TYPE_DECISION,
  SCOPE_TYPE_BOTH,
} from "./helpers/templateV2MappingInserter.js";
import { getTempFilePath } from "../../../helpers/templateTempStorage.js";
import { copyTempTemplateToEfs } from "../../services/documentTemplates/storage/efsTemplateStorageService.js";
import {
  snapshotTemplateToVersion,
  deleteTemplateFromEfs,
} from "../../services/documentTemplates/storage/efsTemplateVersionService.js";
import {
  computeNextVersionNumber,
  insertTemplateVersionRow,
} from "../../services/documentTemplates/templateVersionService.js";
import { validateUpdatePayload, handleEfsRollback } from "./helpers/templateUpdateHelpers.js";

/**
 * Update Document Template V2
 * Updates existing template header + mappings + automation for V2 schema.
 */
export const updateDocumentTemplateV2 = async (req, res) => {
  const user_id = req.user?.userId || req.userId || req.user?.id || null;
  if (!user_id) {
    return res.status(401).json({
      status: 401,
      title: "Authentication required",
      message: "User ID could not be determined. Please log in again.",
      success: false,
    });
  }

  const payloadValidation = validateUpdatePayload(req.body);
  if (!payloadValidation.ok) {
    return res.status(payloadValidation.response.status).json(payloadValidation.response);
  }

  const {
    normalizedTemplateName,
    normalizedDocumentType,
    normalizedDateFormat,
    scopeTypeValue,
    activeStatus,
    templateIdNum,
    hasNewFile,
  } = payloadValidation.normalized;

  const { mappings, tempId, tempFileName } = req.body;

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

  // Declared outside try so the catch block can access them for best-effort cleanup
  let snapshotResult = null;
  let nextVersionNumber = null;
  let newActiveFileWritten = false;
  let oldDocumentName = null;
  let newDocumentName = null;

  const transaction = await mysqlSequelize.transaction();

  try {
    const existingTemplate = await DocumentTemplates.findByPk(templateIdNum, {
      attributes: ["id", "documentname"],
      transaction,
    });

    if (!existingTemplate) {
      await transaction.rollback();
      return res.status(404).json({
        status: 404,
        title: "Template not found",
        message: `Template with ID ${templateIdNum} does not exist.`,
        success: false,
      });
    }

    oldDocumentName = existingTemplate.documentname;
    newDocumentName = hasNewFile
      ? (typeof tempFileName === "string" ? tempFileName.trim() : "")
      : oldDocumentName;

    // Duplicate filename check â€” only when a new file was selected and name actually changed
    if (hasNewFile && newDocumentName !== oldDocumentName) {
      const duplicateCheck = await DocumentTemplates.findOne({
        where: { documentname: newDocumentName, id: { [Op.ne]: templateIdNum } },
        attributes: ["id"],
        transaction,
      });
      if (duplicateCheck) {
        await transaction.rollback();
        return res.status(409).json({
          status: 409,
          title: "Duplicate file name",
          message: `A template with filename "${newDocumentName}" already exists. Please rename the file.`,
          success: false,
        });
      }
    }

    // --- FILE VERSION HISTORY (only when a new file is uploaded) ---
    // Snapshot happens before DocumentTemplates.update so active file is captured
    // in its current state. If anything below fails, the transaction rolls back
    // and we attempt cleanup of the orphaned snapshot via handleEfsRollback.
    if (hasNewFile) {
      nextVersionNumber = await computeNextVersionNumber(templateIdNum, transaction);
      logger.info("[updateDocumentTemplateV2] Snapshotting active template to version history", {
        templateId: templateIdNum, documentName: oldDocumentName, nextVersionNumber,
      });
      snapshotResult = await snapshotTemplateToVersion(oldDocumentName, templateIdNum);
      logger.info("[updateDocumentTemplateV2] EFS snapshot created", {
        templateId: templateIdNum, path: snapshotResult.documentPath,
      });
    }

    // --- ACTIVE FILE WRITE (pre-commit) ---
    if (hasNewFile) {
      const tempFilePath = getTempFilePath(tempId);
      await copyTempTemplateToEfs(tempFilePath, newDocumentName);
      newActiveFileWritten = true;
      logger.info("[updateDocumentTemplateV2] New active file written to EFS (pre-commit)", {
        templateId: templateIdNum, documentName: newDocumentName,
      });
    }

    const now = new Date();
    const isSpanishDoc = normalizedDateFormat === "spanish" ? "1" : "0";
    const updateData = {
      displayname: normalizedTemplateName,
      documenttype: normalizedDocumentType,
      isSpanishdoc: isSpanishDoc,
      active: activeStatus,
      scopeType: scopeTypeValue,
      modifiedDate: now,
      modifiedBy: user_id,
    };
    if (hasNewFile) {
      updateData.documentname = newDocumentName;
    }

    await DocumentTemplates.update(updateData, { where: { id: templateIdNum }, transaction });

    // Delete existing child rows before re-inserting (delete automation first due to FK)
    await DocumentTemplateMappingAutomation.destroy({ where: { templateId: templateIdNum }, transaction });
    await DocumentTemplateCasetypeMapping.destroy({ where: { templateId: templateIdNum }, transaction });

    await insertTemplateMappingRows({
      templateId: templateIdNum, normalizedMappings, scopeTypeValue,
      normalizedTemplateName, user_id, transaction, now,
    });

    // --- VERSION DB ROW (inside transaction â€” atomically rolled back on failure) ---
    if (hasNewFile && snapshotResult) {
      const changeType = newDocumentName !== oldDocumentName
        ? "RENAME_AND_UPDATE_FILE"
        : "UPDATE_FILE";
      await insertTemplateVersionRow({
        templateId: templateIdNum, versionNumber: nextVersionNumber,
        documentName: oldDocumentName, documentPath: snapshotResult.documentPath,
        changeType, changedBy: user_id, transaction,
      });
      logger.info("[updateDocumentTemplateV2] Version row inserted", {
        templateId: templateIdNum, versionNumber: nextVersionNumber, changeType,
      });
    }

    await transaction.commit();

    // --- POST-COMMIT: delete old active file on rename (best-effort) ---
    if (hasNewFile && newDocumentName !== oldDocumentName) {
      try {
        await deleteTemplateFromEfs(oldDocumentName);
        logger.info("[updateDocumentTemplateV2] Old active file deleted from EFS", {
          templateId: templateIdNum, documentName: oldDocumentName,
        });
      } catch (efsDeleteErr) {
        logger.warn("[updateDocumentTemplateV2] EFS delete of old active file failed", {
          templateId: templateIdNum, documentName: oldDocumentName, error: efsDeleteErr.message,
        });
      }
    }

    return res.status(200).json({
      status: 200,
      message: "Document template updated successfully",
      success: true,
      data: { templateId: templateIdNum },
    });
  } catch (error) {
    await transaction.rollback();

    // Best-effort: remove the orphaned EFS snapshot if the DB tx failed after snapshotting.
    // Skipped for same-name overwrite — restore logic below decides whether to clean it up
    // (on restore success) or preserve it (on restore failure, as recovery material).
    const isSameNameOverwrite = newActiveFileWritten && newDocumentName === oldDocumentName;
    if (snapshotResult && !isSameNameOverwrite) {
      try {
        await cleanupVersionSnapshot(snapshotResult.versionDir);
        logger.info("[updateDocumentTemplateV2] Orphaned snapshot cleaned up after tx rollback", {
          versionDir: snapshotResult.versionDir,
        });
      } catch (cleanupErr) {
        logger.warn("[updateDocumentTemplateV2] Snapshot cleanup failed — orphan may remain", {
          versionDir: snapshotResult.versionDir,
          error: cleanupErr.message,
        });
      }
    }

    // EFS rollback for file operations when DB tx failed after active file was written
    if (newActiveFileWritten) {
      if (newDocumentName !== oldDocumentName) {
        // Rename: new active file is an orphan; old file is still intact — delete the new one
        try {
          await deleteTemplateFromEfs(newDocumentName);
          logger.info("[updateDocumentTemplateV2] Orphaned new active file cleaned up after tx rollback", {
            newDocumentName,
          });
        } catch (cleanupErr) {
          logger.warn("[updateDocumentTemplateV2] Orphaned new active file cleanup failed — orphan may remain", {
            newDocumentName,
            error: cleanupErr.message,
          });
        }
      } else {
        // Same-name: active file was overwritten in-place; restore previous content from snapshot
        logger.info("[updateDocumentTemplateV2] Attempting to restore previous active file from snapshot", {
          templateId: templateIdNum,
          documentName: oldDocumentName,
          versionDir: snapshotResult.versionDir,
        });
        
        try {
          await restoreSnapshotToActiveTemplate(snapshotResult.versionDir, oldDocumentName);
          logger.info("[updateDocumentTemplateV2] Previous active file restored successfully from snapshot", {
            templateId: templateIdNum,
            documentName: oldDocumentName,
          });
          // Restore succeeded — snapshot is safe to clean up now
          try {
            await cleanupVersionSnapshot(snapshotResult.versionDir);
            logger.info("[updateDocumentTemplateV2] Snapshot cleaned up after successful restore", {
              versionDir: snapshotResult.versionDir,
            });
          } catch (snapshotCleanupErr) {
            logger.warn("[updateDocumentTemplateV2] Snapshot cleanup failed after restore — orphan may remain", {
              versionDir: snapshotResult.versionDir,
              error: snapshotCleanupErr.message,
            });
          }
        } catch (restoreErr) {
          // Restore failed — do NOT clean up snapshot; it is the only copy of the previous content
          logger.error("[updateDocumentTemplateV2] Active file restore failed — snapshot preserved for manual recovery", {
            templateId: templateIdNum,
            documentName: oldDocumentName,
            versionDir: snapshotResult.versionDir,
            error: restoreErr.message,
          });
        }
      }
    }
    await handleEfsRollback({
      snapshotResult, newActiveFileWritten, newDocumentName, oldDocumentName, templateIdNum,
    });

    logger.error("[updateDocumentTemplateV2] Unhandled error", {
      message: error.message || "N/A",
      sqlMessage: error.sqlMessage || "N/A",
      code: error.code || "N/A",
      name: error.name,
    });

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
      title: "Unable to update document template",
      message: "The document template could not be updated at this time.",
      success: false,
    });
  }
};
