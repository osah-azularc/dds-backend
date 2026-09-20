import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  deleteInvoiceAttachment as deleteInvoiceAttachmentFromS3,
  getInvoiceAttachment,
} from "../../../../helpers/timeexpense/invoicing/invoices/invoiceAttachmentS3Helper.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-20
 * @description
 * Invoice Listing's paperclip/"Attach Files to {invoice}" feature - the two
 * per-attachment actions, Remove and Download. Split out of
 * invoiceAttachmentsController.js (2026-08-27) purely to stay under the
 * 300-line file guideline - no behavior change. getInvoiceAttachments/
 * addInvoiceAttachments (the two collection-level actions) stay in that file;
 * see its own module doc comment for the two deliberate deviations from legacy
 * both files share (single-hop upload, server-side-resolved download path).
 *
 * S3 access goes through this feature's own invoiceAttachmentS3Helper.js (2026-09-02), not the
 * shared helpers/s3.js - see that file's own module doc comment for why (a real incident where an
 * unrelated change to that shared file broke this feature's downloads), and for why it resolves a
 * stored filepath's real key differently depending on whether it's legacy-origin, already written
 * by this module, or an older bare-key row.
 */

const ACTIVE_STATUS = "1";
const INACTIVE_STATUS = "0";
const ATTACHMENT_DELETED_ACTION = 12;

const CONTENT_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

const getExtension = (fileName) => (fileName.split(".").pop() || "").toLowerCase();

const attachmentNotFound = (res) =>
  res.status(404).json({ success: false, message: "Attachment not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Remove a saved attachment - matches deleteAttachFileAction: soft-delete
 * (status='0'), delete the S3 object, write an audit log row. Scoped to the given
 * invoice id (deleteAttachFileAction looks the row up by id alone, with no
 * invoice cross-check at all) - a narrow, deliberate hardening in the same spirit
 * as the other "backend must not trust an unscoped id" corrections already made
 * elsewhere in this module.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, fileCount }, status }
 */
export const deleteInvoiceAttachment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, attachmentId } = req.params;
    const attachment = await InvoiceAttachment.findOne({
      where: { id: attachmentId, invId: id, status: ACTIVE_STATUS },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!attachment) {
      await transaction.rollback();
      return attachmentNotFound(res);
    }

    const invoice = await Invoice.findByPk(id, { transaction });

    const now = new Date();
    await attachment.update({ status: INACTIVE_STATUS, modifiedDate: now }, { transaction });
    await InvLog.create(
      {
        invId: id,
        invNo: invoice?.invNo ?? null,
        extId: attachment.id,
        action: ATTACHMENT_DELETED_ACTION,
        description: "Attachment Deleted",
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();

    // S3 delete happens after the DB commit succeeds - matches this module's established
    // "financial/audit state commits first, the best-effort external side effect follows"
    // posture (e.g. resendInvoice's email send). A delete failure here is logged, not surfaced as
    // a user-facing error - the attachment is already correctly gone from every UI the user sees.
    try {
      await deleteInvoiceAttachmentFromS3(attachment.filepath);
    } catch (s3Error) {
      logger.error("Error deleting invoice attachment from S3:", {
        attachmentId: attachment.id,
        error: s3Error.message,
      });
    }

    const remaining = await InvoiceAttachment.count({ where: { invId: id, status: ACTIVE_STATUS } });
    return res.status(200).json({ success: true, data: { id: attachment.id, fileCount: remaining }, status: 200 });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "deleting invoice attachment", "Unable to delete attachment. Please try again.");
  }
};

/**
 * @description
 * Download a single attachment - matches downloadEachAttachmentAction's real
 * effect (stream the S3 object back as an attachment), but looks the row up
 * server-side by id (scoped to the invoice) instead of trusting a client-supplied
 * filepath - see invoiceAttachmentsController.js's own module doc comment.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} the file's bytes, Content-Type/Content-Disposition set from the stored filename - or a JSON error before any bytes are written.
 */
export const downloadInvoiceAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const attachment = await InvoiceAttachment.findOne({
      where: { id: attachmentId, invId: id, status: ACTIVE_STATUS },
    });
    if (!attachment) return attachmentNotFound(res);

    const body = await getInvoiceAttachment(attachment.filepath);
    if (!body) {
      return res.status(404).json({
        success: false,
        message: "This attachment's file could not be found. Please contact your administrator.",
        status: 404,
      });
    }

    const extension = getExtension(attachment.fileName);
    res.setHeader("Content-Type", CONTENT_TYPE_BY_EXTENSION[extension] || "application/octet-stream");
    // CODE_REVIEW M-2 fix: strip characters that could break out of the quoted
    // Content-Disposition value or inject additional header content (CR/LF, ", \) - the stored
    // fileName itself is untouched (display-only elsewhere, matches what the user uploaded).
    // Filtered by code point rather than a control-character regex range, which static analysis
    // (rightly, in general) flags as easy to mistype/misread.
    const DISALLOWED_DISPOSITION_CHARS = new Set(['"', "\\"]);
    const safeDispositionName = Array.from(attachment.fileName)
      .filter((char) => {
        const code = char.codePointAt(0);
        // Below 0x20 = C0 control chars (incl. CR/LF); 0x7F = DEL.
        return code >= 0x20 && code !== 0x7f && !DISALLOWED_DISPOSITION_CHARS.has(char);
      })
      .join("");
    res.setHeader("Content-Disposition", `attachment; filename="${safeDispositionName}"`);

    if (typeof body.pipe === "function") {
      body.pipe(res);
      return undefined;
    }
    return res.send(Buffer.from(body));
  } catch (error) {
    return actionFailed(res, error, "downloading invoice attachment", "Unable to download attachment. Please try again.");
  }
};
