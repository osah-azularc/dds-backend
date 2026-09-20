import InvoiceTemplate from "../../../../models/timeexpense/invoicing/InvoiceTemplate.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { getInvoiceAttachment } from "../invoices/invoiceAttachmentS3Helper.js";
import { roundMoney, sumItemTotals } from "./computationHelpers.js";
import { buildInvoicePdfSections } from "../invoices/invoicePdfSections.js";
import { generateInvoicePdfHtml } from "../invoices/invoicePdfTemplate.js";
import { renderInvoicePdfBuffer } from "../invoices/invoicePdfService.js";
import { sendInvoiceEmail } from "./invoiceEmailHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Ties invoicePdfTemplate/invoicePdfService/invoiceEmailHelpers together into
 * one call - generate the saved invoice's PDF, then email it. Used by
 * saveManualInvoice/updateManualInvoice's "Send Invoice" path, after their DB
 * transaction has already committed.
 *
 * FIXED (2026-08-26, Bulk Invoicing Send Invoices analysis): now also attaches
 * any active uploaded invoice_attachments (the Attach Files feature, already
 * shipped) alongside the generated PDF - matches legacy's own
 * sendBulkInvoicesAction, which pulls the same status='1' rows and staples them
 * onto every outgoing send. This was a real, pre-existing gap in the already-
 * shipped single-invoice Resend/Send actions too (both call this same function) -
 * fixed here once, for every caller, rather than only for the new bulk path.
 * Environment note: this local dev environment has no AWS credentials configured
 * (checklist item 7), so a real successful attachment fetch can't be live-verified
 * here - fetchUploadedAttachmentsForEmail below fails soft per-attachment (logs,
 * skips) specifically so that gap degrades gracefully rather than blocking a send.
 */

// Matches invoiceAttachmentsController.js's own CONTENT_TYPE_BY_EXTENSION - kept as its own small,
// file-local copy (same convention already used elsewhere in this module, e.g. STATUS_LABELS in
// bulkInvoiceInvoiceCorrectionHelpers.js) rather than importing a controller-owned const into a
// helper file, which would invert this module's usual helper->controller dependency direction.
const ATTACHMENT_CONTENT_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

// Matches downloadInvoiceAttachment's own dual handling (invoiceAttachmentsController.js) - S3's
// GetObjectCommand response body is a Node Readable in this runtime; buffered here (rather than
// piped) since a base64 email attachment needs the whole file in memory anyway.
const streamToBuffer = (body) =>
  new Promise((resolve, reject) => {
    if (typeof body?.pipe !== "function") {
      resolve(Buffer.from(body));
      return;
    }
    const chunks = [];
    body.on("data", (chunk) => chunks.push(chunk));
    body.on("end", () => resolve(Buffer.concat(chunks)));
    body.on("error", reject);
  });

/**
 * @description
 * This invoice's active uploaded attachments, shaped as SendGrid attachment
 * objects ready to append alongside the generated PDF. Never throws: a single
 * attachment's S3 fetch failing is logged and that one file is skipped, not
 * treated as a reason to fail the whole send (matches this module's established
 * "best-effort external side effect" posture, e.g. deleteInvoiceAttachment's own
 * S3-delete-after-commit).
 * @param {*} invoiceId
 */
const fetchUploadedAttachmentsForEmail = async (invoiceId) => {
  const attachments = await InvoiceAttachment.findAll({ where: { invId: invoiceId, status: "1" } });
  const results = [];
  for (const attachment of attachments) {
    try {
      const body = await getInvoiceAttachment(attachment.filepath);
      if (!body) continue;
      const buffer = await streamToBuffer(body);
      const extension = (attachment.fileName.split(".").pop() || "").toLowerCase();
      results.push({
        content: buffer.toString("base64"),
        filename: attachment.fileName,
        type: ATTACHMENT_CONTENT_TYPE_BY_EXTENSION[extension] || "application/octet-stream",
        disposition: "attachment",
      });
    } catch (error) {
      logger.error("Error fetching uploaded invoice attachment for email:", {
        invoiceId,
        attachmentId: attachment.id,
        error: error.message,
      });
    }
  }
  return results;
};

/**
 * @description (undocumented)
 * @param {*} invoice
 * @param {*} items
 * @returns {*} Buffer (rendered PDF) - throws on failure, same as its callers' own helpers (buildInvoicePdfSections/renderInvoicePdfBuffer) already do; callers decide how to handle that (generateAndSendInvoiceEmail below treats it as a failed send, invoiceBulkActionsController's bulk Download skips that one invoice and continues the rest of the zip).
 */
export const buildInvoicePdfBuffer = async (invoice, items) => {
  const template = await InvoiceTemplate.findOne({ order: [["id", "ASC"]] });
  // itemRows carries the item code under the DB's own column name, `expense` - not
  // `itemCode`, which is only how the *incoming request* (saveManualInvoiceBodySchema) names
  // it - buildInvoicePdfSections expects the latter.
  const sections = await buildInvoicePdfSections(
    items.map((item) => ({
      itemType: item.itemType,
      itemCode: item.expense,
      professional: item.professional,
      quantity: item.quantity,
      rate: item.rate,
      total: item.total,
      taskId: item.taskId,
    })),
  );

  // Recomputed from the real items, not trusted from invoice.subtotal/invAmt - matches legacy's
  // generateSummary() exactly ($data['all_items_total'] += $item['total'], then
  // invoiceMasterData['subtotal']/['inv_amt'] get overwritten with it), which is what actually
  // powers legacy's View PDF/Send/Resend - it never renders those two stored columns directly
  // either. See computationHelpers.js's sumItemTotals for why this matters: those columns can go
  // stale relative to the real invoice_items with nothing to ever re-sync them.
  const subtotal = sumItemTotals(items);
  const discount = Number(invoice.discount) || 0;

  const html = await generateInvoicePdfHtml({
    invNo: invoice.invNo,
    invDate: invoice.invDate,
    billDateFrom: invoice.billDateFrom,
    billDateTo: invoice.billDateTo,
    agencyName: invoice.agencyName,
    sections,
    subtotal,
    discount: invoice.discount,
    discountDesc: invoice.discountDesc,
    total: roundMoney(subtotal - discount),
    remitInformation: invoice.remitInformation,
    taxInformation: invoice.taxInformation,
    orgHeading: template?.heading || "",
    logoImage: template?.image || null,
  });

  return renderInvoicePdfBuffer(html);
};

/**
 * @description (undocumented)
 * @param {*} invoice
 * @param {*} items
 * @returns {*} { success, sentCount, failedCount } - never throws; a failure here doesn't mean the invoice save failed, since this only runs after that already committed (matches legacy: the invoice stays saved/sent-status even if the email itself fails to go out).
 */
export const generateAndSendInvoiceEmail = async (invoice, items) => {
  try {
    const pdfBuffer = await buildInvoicePdfBuffer(invoice, items);
    const extraAttachments = await fetchUploadedAttachmentsForEmail(invoice.id);

    return await sendInvoiceEmail({
      invNo: invoice.invNo,
      agencyName: invoice.agencyName,
      agencyEmail: invoice.agencyEmail,
      balance: invoice.balance,
      invDueDate: invoice.invDueDate,
      isOverdue: invoice.status === 4,
      pdfBuffer,
      extraAttachments,
    });
  } catch (error) {
    logger.error("Error generating/sending invoice PDF email:", {
      invNo: invoice.invNo,
      error: error.message,
      stack: error.stack,
    });
    return { success: false, sentCount: 0, failedCount: 0 };
  }
};

/**
 * @description
 * Shared tail of saveManualInvoice/updateManualInvoice, called after their
 * transaction has committed - sends the invoice (only when the caller says to)
 * and shapes the { id, invNo, status, emailResult? } response payload both
 * endpoints return.
 * `shouldSend` is caller-computed from each caller's own real legacy send
 * trigger (2026-09-03 parity audit - both keyed off `sendInvoiceStatus`, the
 * literal button clicked, before this fix): saveManualInvoice (Create) sends
 * when the *computed* status lands on 5 or 4 (saveInvoiceAction's
 * `$invoiceStatus == 5 || $invoiceStatus == 4` - a plain Save Draft with an
 * already-past invoice date still emails the agency, since
 * computeDueDateAndStatus's create-only overdue override can land on 4 with no
 * Send click at all); updateManualInvoice (Edit) sends when the computed status
 * is in {4,5,6,7} (updateInvoiceAction's `in_array($status, [4,5,6,7])` -
 * notably excludes 3/Paid, so clicking Send while the invoice is already Paid
 * does NOT resend in either legacy or here).
 * @param {*} invoice
 * @param {*} itemRows
 * @param {boolean} shouldSend
 * @param {*} status
 */
export const finalizeInvoiceSave = async (invoice, itemRows, shouldSend, status) => {
  const emailResult = shouldSend
    ? await generateAndSendInvoiceEmail(invoice.toJSON(), itemRows)
    : undefined;

  return {
    id: invoice.id,
    invNo: invoice.invNo,
    status,
    ...(emailResult ? { emailResult } : {}),
  };
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Send - the Draft-status counterpart of Resend. Extracted from
 * invoiceActionsController.js's own sendInvoice (single-invoice Send action,
 * already shipped) so Bulk Invoicing's own Send Invoices (per-invoice, looped)
 * can reuse the exact same logic instead of duplicating it - matches
 * sendInvoiceFromListAction: generates + emails the PDF, then transitions the
 * invoice out of Draft (status 2 -> 5/Unpaid, balance set to the full invoice
 * amount) and logs it. Same deliberate improvement over legacy both callers now
 * share: only transitions status after a confirmed successful send, never
 * unconditionally like legacy's own unchecked sendInvoice() call.
 * @param {*} invoice
 * @param {*} params
 * @param {*} description
 * @returns {*} { success: true, balance } on a confirmed send, or { success: false, reason } - reason is 'not-draft' | 'no-email' | 'email-failed'. Never throws.
 */
export const sendDraftInvoice = async (invoice, { userId, description = "Invoice sent" } = {}) => {
  if (invoice.status !== 2) {
    return { success: false, reason: "not-draft" };
  }
  if (!invoice.agencyEmail) {
    return { success: false, reason: "no-email" };
  }

  const items = await InvoiceItem.findAll({ where: { invId: invoice.id, isDeleted: 0 } });
  const emailResult = await generateAndSendInvoiceEmail(
    invoice.toJSON(),
    items.map((item) => item.toJSON()),
  );
  if (!emailResult.success) {
    return { success: false, reason: "email-failed" };
  }

  const balance = invoice.invAmt;
  await invoice.update({ status: 5, balance });
  await InvLog.create({
    invId: invoice.id,
    invNo: invoice.invNo,
    action: 5,
    description,
    status: "1",
    createdAt: new Date(),
    createdBy: userId,
  });

  return { success: true, balance };
};
