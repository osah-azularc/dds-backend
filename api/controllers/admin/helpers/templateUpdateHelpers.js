import { logger } from "../../../../config/winstonLogger.js";
import {
  SCOPE_TYPE_DECISION,
  SCOPE_TYPE_GENERAL,
  SCOPE_TYPE_BOTH,
} from "./templateV2MappingInserter.js";
import {
  cleanupVersionSnapshot,
  deleteTemplateFromEfs,
  restoreSnapshotToActiveTemplate,
} from "../../../services/documentTemplates/storage/efsTemplateVersionService.js";

/**
 * Validates and normalizes the update payload fields before any DB operations.
 * Mirrors the return shape of parseAndValidateTemplateV2Mappings so the caller
 * can apply a single pattern: if (!result.ok) return res.status(...).json(result.response)
 *
 * @param {object} body - req.body
 * @returns {{ ok: true, normalized: object } | { ok: false, response: object }}
 */
export const validateUpdatePayload = ({
  templateId,
  templateName,
  documentType,
  scopeType,
  status,
  dateFormat,
  tempId,
  tempFileName,
}) => {
  const normalizedTemplateName = typeof templateName === "string" ? templateName.trim() : "";
  const normalizedDocumentType = typeof documentType === "string" ? documentType.trim() : "";
  const normalizedDateFormat = typeof dateFormat === "string" ? dateFormat.trim() : "";
  const scopeTypeValue = Number(scopeType);
  const activeStatus = String(status) === "0" ? "0" : "1";
  const templateIdNum = Number(templateId);
  const hasNewFile = !!(tempId && tempFileName);

  if (!templateIdNum || templateIdNum <= 0) {
    return {
      ok: false,
      response: { status: 400, title: "Validation error", message: "Valid template ID is required.", success: false },
    };
  }

  if (!normalizedTemplateName || !normalizedDocumentType) {
    return {
      ok: false,
      response: { status: 400, title: "Validation error", message: "Template name and document type are required.", success: false },
    };
  }

  if (![SCOPE_TYPE_DECISION, SCOPE_TYPE_GENERAL, SCOPE_TYPE_BOTH].includes(scopeTypeValue)) {
    return {
      ok: false,
      response: { status: 400, title: "Validation error", message: "Scope type is invalid.", success: false },
    };
  }

  if (hasNewFile) {
    const normalizedTempFileName = typeof tempFileName === "string" ? tempFileName.trim() : "";
    if (!normalizedTempFileName.toLowerCase().endsWith(".docx")) {
      return {
        ok: false,
        response: { status: 400, title: "Validation error", message: "Only .docx files are allowed.", success: false },
      };
    }
  }

  if (!normalizedDateFormat || !["english", "spanish"].includes(normalizedDateFormat)) {
    return {
      ok: false,
      response: { status: 400, title: "Validation error", message: "Date format must be english or spanish.", success: false },
    };
  }

  return {
    ok: true,
    normalized: {
      normalizedTemplateName,
      normalizedDocumentType,
      normalizedDateFormat,
      scopeTypeValue,
      activeStatus,
      templateIdNum,
      hasNewFile,
    },
  };
};

/**
 * Best-effort EFS cleanup after a DB transaction rollback during template update.
 * Handles three scenarios:
 *   1. Snapshot created but no new file written → delete orphaned snapshot dir
 *   2. New file written, different name (rename) → delete orphaned new file
 *   3. New file written, same name (overwrite)  → restore previous content from snapshot
 *
 * @param {object}      params
 * @param {object|null} params.snapshotResult
 * @param {boolean}     params.newActiveFileWritten
 * @param {string|null} params.newDocumentName
 * @param {string|null} params.oldDocumentName
 * @param {number}      params.templateIdNum
 */
export const handleEfsRollback = async ({
  snapshotResult,
  newActiveFileWritten,
  newDocumentName,
  oldDocumentName,
  templateIdNum,
}) => {
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

  if (!newActiveFileWritten) return;

  if (newDocumentName !== oldDocumentName) {
    // Rename case: orphaned new file, old file still intact — delete the new one
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
    return;
  }

  // Same-name overwrite: active file was replaced in-place; restore from snapshot
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
    // Do NOT clean up snapshot — it is the only copy of the previous content
    logger.error("[updateDocumentTemplateV2] Active file restore failed — snapshot preserved for manual recovery", {
      templateId: templateIdNum,
      documentName: oldDocumentName,
      versionDir: snapshotResult.versionDir,
      error: restoreErr.message,
    });
  }
};
