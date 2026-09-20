import { logger } from "../../config/winstonLogger.js";
import * as bulkEmailService from "../services/bulkEmailService.js";

/**
 * Bulk Email Controller
 * Thin request/response layer for the Bulk Email feature — business logic
 * lives in api/services/bulkEmailService.js.
 * Mirrors legacy osah-repos SearchresultController/SearchResult.php.
 */

/** @route POST /admin/getBulkEmails */
export const getBulkEmails = async (req, res) => {
  try {
    const { bulkEmails, pagination } = await bulkEmailService.listBulkEmails(req.body);
    return res.status(200).json({ success: true, status: 200, data: bulkEmails, pagination });
  } catch (error) {
    logger.error("[getBulkEmails] error:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Failed to fetch bulk emails",
      error: error.message,
    });
  }
};

/**
 * @route POST /admin/getBulkEmailsComDataById
 * body: { bulk_email_template_id, emailType: 'sentEmails' | 'draftEmails' }
 */
export const getBulkEmailsComDataById = async (req, res) => {
  try {
    const { bulk_email_template_id: bulkEmailTemplateId, emailType } = req.body;

    if (!bulkEmailTemplateId) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "bulk_email_template_id is required",
      });
    }

    const data = await bulkEmailService.getBulkEmailComData({ bulkEmailTemplateId, emailType });
    return res.status(200).json({ data });
  } catch (error) {
    logger.error("[getBulkEmailsComDataById] error:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Failed to fetch bulk email data",
      error: error.message,
    });
  }
};

/** @route DELETE /bulk-email/:id */
export const deleteBulkEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { notFound } = await bulkEmailService.deleteBulkEmailTemplate(id);

    if (notFound) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Bulk email template not found",
      });
    }

    return res.status(200).json({ success: true, status: 200, message: "Deleted successfully" });
  } catch (error) {
    logger.error("[deleteBulkEmail] error:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Failed to delete bulk email",
      error: error.message,
    });
  }
};

/**
 * Upload a bulk-email attachment to disk. Pure disk drop, no DB write —
 * mirrors legacy PHP SearchresultController::uploadDocketAttachmentAction().
 * The frontend sends the returned filepath back on /bulk-email/send as `attachments`.
 * @route POST /bulk-email/upload-attachment
 */
export const uploadBulkEmailAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(200).json({ msg: "Failed to Upload file", status: 404, filepath: null });
    }

    const filepath = await bulkEmailService.saveEmailAttachment(req.userId, req.file);
    return res.status(200).json({ msg: "Uploaded File", status: 200, filepath });
  } catch (error) {
    logger.error("[uploadBulkEmailAttachment] error:", error);
    return res.status(200).json({ msg: "Failed to Upload file", status: 404, filepath: null });
  }
};

/**
 * Get unique email recipients for selected dockets.
 * Pre-existing endpoint — queries parties_master/case_parties (no Sequelize models for those tables).
 * @route POST /bulk-email/get-recipients
 */
export const getBulkEmailRecipients = async (req, res) => {
  try {
    const { caseIds } = req.body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Valid case IDs array is required",
      });
    }

    const recipients = await bulkEmailService.fetchPartyRecipients(caseIds);
    return res.status(200).json({ success: true, data: recipients, total_recipients: recipients.length });
  } catch (error) {
    logger.error("Error fetching bulk email recipients:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bulk email recipients",
      error: error.message,
    });
  }
};

/**
 * Draft or send bulk email for selected dockets.
 * Mirrors PHP SearchResult::bulkEmail() — fetches recipients server-side,
 * saves template + mapping records, sends emails when actionType === 'sendEmail'.
 * When bulkEmailTemplateId is supplied, updates that existing template in
 * place instead of creating a new one (editing a saved draft); recipients are
 * re-derived from the template's existing case mappings rather than a fresh
 * docketIds list, since the frontend doesn't resend one for edits.
 * Attachment (if any) is a filepath string already returned by
 * POST /bulk-email/upload-attachment, not a file upload on this request.
 * Returns legacy success codes: 1=sent, 2=draft, 3=no recipients, 4=no valid emails.
 * @route POST /bulk-email/send
 */
export const sendBulkEmail = async (req, res) => {
  try {
    const bulkEmailTemplateId = req.body?.bulkEmailTemplateId || null;
    const actionType = req.body?.actionType;
    const subject = req.body?.subject || "";
    const emailMsg = req.body?.emailMsg || "";
    const advanceFilters = req.body?.advanceFilters || "";
    const removeAttachment = req.body?.removeAttachment === "true";
    const loggedInUserId = req.userId;

    const {
      template: resolvedTemplate,
      docketIds,
      notFound,
    } = await bulkEmailService.resolveTemplateAndDocketIds(bulkEmailTemplateId, req.body?.docketIds);
    let template = resolvedTemplate;

    if (notFound) {
      return res.status(404).json({ success: false, message: "Bulk email not found" });
    }

    if (!Array.isArray(docketIds) || !docketIds.length) {
      return res.status(400).json({ success: false, message: "No dockets selected" });
    }

    const allRecipients = await bulkEmailService.fetchBulkEmailRecipients(docketIds);
    if (!allRecipients.length) {
      return res.status(200).json({ success: 3 });
    }

    const validRecipients = allRecipients.filter((r) => bulkEmailService.isValidEmail(r.Email));
    if (!validRecipients.length) {
      return res.status(200).json({ success: 4 });
    }

    const emailStatus = actionType === "sendEmail" ? "1" : "0";
    const { emailAttachment, attachmentBuffer, attachmentName } = await bulkEmailService.resolveOutgoingAttachment({
      uploadedAttachmentPath: req.body?.attachments || null,
      removeAttachment,
      template,
      actionType,
    });

    template = await bulkEmailService.saveTemplateAndMappings({
      template,
      subject,
      emailMsg,
      emailStatus,
      emailAttachment,
      loggedInUserId,
      validRecipients,
      advanceFilters,
    });

    if (actionType === "sendEmail") {
      const responseBody = await bulkEmailService.sendAndBuildResponse({
        template,
        bulkEmailTemplateId,
        validRecipients,
        subject,
        emailMsg,
        attachmentBuffer,
        attachmentName,
        loggedInUserId,
      });
      return res.status(200).json(responseBody);
    }

    return res.status(200).json({ success: 2, bulk_email_template_id: template.id });
  } catch (error) {
    logger.error("[BulkEmail] Error processing bulk email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process bulk email",
      error: error.message,
    });
  }
};
