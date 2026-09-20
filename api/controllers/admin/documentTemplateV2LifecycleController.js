import path from "path";
import fs from "fs";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import { logger } from "../../../config/winstonLogger.js";
import DocumentTemplates from "../../models/admin/documentTemplatesModel.js";
import DocumentTemplateCasetypeMapping from "../../models/admin/documentTemplateCasetypeMappingModel.js";
import DocumentTemplateMappingAutomation from "../../models/admin/documentTemplateMappingAutomationModel.js";
import DocumentTemplateVersions from "../../models/admin/documentTemplateVersionsModel.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import {
  deleteTemplateFromEfs,
  deleteTemplateVersionDir,
} from "../../services/documentTemplates/storage/efsTemplateVersionService.js";

/**
 * Update template status (active/inactive) for V2
 * Updates only the active field in document_templates
 *
 * @param {number} templateId - Template ID
 * @param {string} active - "1" for active, "0" for inactive
 * @author AI Assistant
 * @date March 1, 2026
 */
export const updateTemplateStatusV2 = async (req, res) => {
  const user_id = req.user?.userId || req.userId || req.user?.id || null;
  const { templateId, active } = req.body;

  // Validate user authentication
  if (!user_id) {
    return res.status(401).json({
      status: 401,
      title: "Authentication required",
      message: "User ID could not be determined. Please log in again.",
      success: false,
    });
  }

  // Validate input
  const templateIdNum = Number(templateId);
  if (!templateIdNum || templateIdNum <= 0) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Valid template ID is required.",
      success: false,
    });
  }

  if (active !== "0" && active !== "1") {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Active status must be '0' or '1'.",
      success: false,
    });
  }

  try {
    // Check if template exists
    const existingTemplate = await DocumentTemplates.findByPk(templateIdNum, {
      attributes: ['id'],
    });

    if (!existingTemplate) {
      return res.status(404).json({
        status: 404,
        title: "Template not found",
        message: `Template with ID ${templateIdNum} does not exist.`,
        success: false,
      });
    }

    // Update active status
    const now = new Date();
    await DocumentTemplates.update(
      { active, modifiedDate: now, modifiedBy: user_id },
      { where: { id: templateIdNum } }
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Template status updated successfully",
      data: { id: templateIdNum, active },
    });
  } catch (error) {
    logger.error("[updateTemplateStatusV2] Error", { message: error.message });
    return res.status(500).json({
      status: 500,
      title: "Unable to update template status",
      message: "Template status could not be updated at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Delete Document Template V2 (hard delete)
 * Transaction-based cascade delete: automation → mappings → template
 *
 * @param {number} templateId - Template ID to delete
 * @returns {200} Success with deleted template ID
 * @returns {404} Template not found
 * @returns {500} Database error or transaction failure
 * @author AI Assistant
 * @date March 1, 2026
 */
export const deleteTemplateV2 = async (req, res) => {
  const user_id = req.user?.userId || req.userId || req.user?.id || null;
  const { templateId } = req.body;

  // Validate user authentication
  if (!user_id) {
    return res.status(401).json({
      status: 401,
      title: "Authentication required",
      message: "User ID could not be determined. Please log in again.",
      success: false,
    });
  }

  // Validate input
  const templateIdNum = Number(templateId);
  if (!templateIdNum || templateIdNum <= 0) {
    return res.status(400).json({
      status: 400,
      title: "Validation error",
      message: "Valid template ID is required.",
      success: false,
    });
  }

  const transaction = await mysqlSequelize.transaction();

  try {
    // Check if template exists before deletion
    const existingTemplate = await DocumentTemplates.findByPk(templateIdNum, {
      attributes: ['id', 'displayname', 'documentname'],
      transaction,
    });

    if (!existingTemplate) {
      await transaction.rollback();
      return res.status(404).json({
        status: 404,
        title: "Template not found",
        message: `Template with ID ${templateIdNum} does not exist or has already been deleted.`,
        success: false,
      });
    }

    const templateName = existingTemplate.displayname;
    const { documentname } = existingTemplate;

    // CASCADE DELETE ORDER: version history → automation mappings → case type mappings → template

    // Step 1: Delete version history rows
    await DocumentTemplateVersions.destroy({
      where: { templateId: templateIdNum },
      transaction,
    });

    // Step 2: Delete automation mappings
    await DocumentTemplateMappingAutomation.destroy({
      where: { templateId: templateIdNum },
      transaction,
    });

    // Step 3: Delete case type mappings
    await DocumentTemplateCasetypeMapping.destroy({
      where: { templateId: templateIdNum },
      transaction,
    });

    // Step 4: Delete template
    await DocumentTemplates.destroy({
      where: { id: templateIdNum },
      transaction,
    });

    // Commit transaction
    await transaction.commit();
    // POST-COMMIT: best-effort EFS cleanup (active file + version snapshots)
    if (documentname) {
      try {
        await deleteTemplateFromEfs(documentname);
      } catch (efsErr) {
        logger.warn("[deleteTemplateV2] Active EFS file delete failed", { templateId: templateIdNum, error: efsErr.message });
      }
    }
    try {
      await deleteTemplateVersionDir(templateIdNum);
    } catch (efsDirErr) {
      logger.warn("[deleteTemplateV2] Version EFS dir delete failed", { templateId: templateIdNum, error: efsDirErr.message });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Template deleted successfully",
      data: { id: templateIdNum, name: templateName },
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("[deleteTemplateV2] Error", {
      message: error.message || "N/A",
      sqlMessage: error.sqlMessage || "N/A",
      code: error.code || "N/A",
      name: error.name,
    });

    return res.status(500).json({
      status: 500,
      title: "Unable to delete template",
      message: "Template could not be deleted at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Get version history for a document template.
 * Returns all recorded versions sorted newest-first.
 *
 * @route GET /admin/getTemplateVersionsV2/:templateId
 */
export const getTemplateVersionsV2 = async (req, res) => {
  const { templateId } = req.params;
  const templateIdNum = parseInt(templateId, 10);

  if (Number.isNaN(templateIdNum) || templateIdNum <= 0) {
    return res.status(400).json({ success: false, message: "Invalid templateId" });
  }

  try {
    const rows = await DocumentTemplateVersions.findAll({
      where: { templateId: templateIdNum },
      order: [["versionNumber", "DESC"]],
      attributes: ["id", "versionNumber", "documentname", "changeType", "changedBy", "changedAt"],
    });

    const userIds = [...new Set(rows.map((v) => v.changedBy).filter(Boolean))];
    const userMap = {};
    if (userIds.length) {
      const users = await JudgeAssistantClerk.findAll({
        where: { userId: userIds },
        attributes: ["userId", "firstName", "lastName"],
      });
      users.forEach((u) => {
        userMap[u.userId] = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      });
    }

    const versions = rows.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      documentName: v.documentname,
      changeType: v.changeType,
      changedByName: userMap[v.changedBy] ?? null,
      changedAt: v.changedAt,
    }));

    return res.json({ success: true, versions });
  } catch (error) {
    logger.error("[getTemplateVersionsV2] Error:", { message: error.message });
    return res.status(500).json({ success: false, message: "Failed to fetch template versions" });
  }
};

/**
 * Download a version snapshot DOCX from EFS.
 * @route GET /admin/downloadTemplateVersionV2/:versionId
 */
export const downloadTemplateVersionV2 = async (req, res) => {
  const versionIdNum = parseInt(req.params.versionId, 10);
  if (Number.isNaN(versionIdNum) || versionIdNum <= 0) {
    return res.status(400).json({ success: false, message: "Invalid versionId" });
  }
  const efsBasePath = process.env.EFS_BASE_PATH;
  if (!efsBasePath) {
    return res.status(500).json({ success: false, message: "EFS storage not configured" });
  }
  try {
    const row = await DocumentTemplateVersions.findByPk(versionIdNum, {
      attributes: ["documentname", "documentPath"],
    });
    if (!row || !row.documentPath) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const absolutePath = path.join(efsBasePath, row.documentPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: "Version file not found on EFS" });
    }
    return res.download(absolutePath, row.documentname || "template.docx");
  } catch (error) {
    logger.error("[downloadTemplateVersionV2] Error:", { message: error.message });
    return res.status(500).json({ success: false, message: "Failed to download version file" });
  }
};

