import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { generateAndSendInvoiceEmail, sendDraftInvoice } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Time & Expense > Invoicing > Invoices tab - the per-row Actions menu's Resend
 * / Send. Split out of invoiceActionsController.js (2026-08-27, alongside
 * invoiceStatusActionsController.js and invoiceBalanceActionsController.js)
 * purely to stay under the 300-line file guideline - no behavior change.
 */

const invoiceNotFound = (res) =>
  res.status(404).json({ success: false, message: "Invoice not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Resend - matches resendInvoiceFromListAction: regenerates the invoice's PDF and
 * re-sends it to the agency's email, reusing the exact same helper the "Send
 * Invoice" save path already uses (generateAndSendInvoiceEmail /
 * buildInvoicePdfSections) rather than a second email mechanism. Traced legacy's
 * own status/balance recompute here in detail - it's a no-op in every real case
 * (the arithmetic always reassigns the same value that was already there), so
 * this endpoint doesn't touch status/balance at all. The one real side effect
 * legacy has is deactivating stale invoice_partial_payments rows for a
 * non-Partial invoice - reproduced below even though it's a no-op for well-formed
 * data, since it's real, provable legacy behavior, not a guess.
 *
 * Invoice attachments (legacy also forwards active invoice_attachments as email
 * attachments here) ARE included, via generateAndSendInvoiceEmail's own
 * fetchUploadedAttachmentsForEmail (invoiceSendHelpers.js) - this comment
 * previously said that subsystem didn't exist yet; it now does (Attach Files
 * feature, shipped this same PR) and generateAndSendInvoiceEmail was fixed
 * 2026-08-26 to forward it for every caller, this one included. Left this note
 * in place (rather than deleting it outright) so a reader who remembers the old
 * gap can see it was closed, not just silently disappear.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id }, status }
 */
export const resendInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return invoiceNotFound(res);

    if (!invoice.agencyEmail) {
      return res.status(400).json({
        success: false,
        message: "This invoice has no recipient email on file.",
        status: 400,
      });
    }

    const items = await InvoiceItem.findAll({ where: { invId: id, isDeleted: 0 } });
    const emailResult = await generateAndSendInvoiceEmail(
      invoice.toJSON(),
      items.map((item) => item.toJSON()),
    );

    if (!emailResult.success) {
      return res.status(502).json({
        success: false,
        message: "Unable to resend invoice email. Please try again.",
        status: 502,
      });
    }

    if (invoice.status !== 6) {
      await InvoicePartialPayment.update({ status: "0" }, { where: { invId: id } });
    }

    await InvLog.create({
      invId: id,
      invNo: invoice.invNo,
      action: 5,
      description: `Invoice sent to ${invoice.agencyEmail}`,
      status: "1",
      createdAt: new Date(),
      createdBy: req.user.userId,
    });

    return res.status(200).json({ success: true, data: { id: invoice.id }, status: 200 });
  } catch (error) {
    return actionFailed(res, error, "resending invoice", "Unable to resend invoice. Please try again.");
  }
};

/**
 * @description
 * Send - the Draft-status counterpart of Resend, matches
 * sendInvoiceFromListAction: generates + emails the PDF (same
 * generateAndSendInvoiceEmail helper), then transitions the invoice out of Draft
 * (status 2 -> 5/Unpaid, balance set to the full invoice amount).
 *
 * One deliberate improvement over legacy: legacy calls sendInvoice without
 * checking its result at all, then unconditionally flips status/balance even if
 * the email failed - silently "sending" an invoice nobody received, with no
 * error surfaced anywhere. This only transitions status after a confirmed
 * successful send, matching the same email-result gate already used for Resend
 * and Write Off/Partial Payment's own "recompute, don't trust an unchecked side
 * effect" posture elsewhere in this module.
 *
 * The actual send/transition logic now lives in sendDraftInvoice
 * (invoiceSendHelpers.js) - extracted (2026-08-26) so Bulk Invoicing's own Send
 * Invoices could reuse it per-invoice instead of duplicating this same sequence;
 * no behavior change to this route from that extraction.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const sendInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return invoiceNotFound(res);

    const result = await sendDraftInvoice(invoice, { userId: req.user.userId });

    if (!result.success) {
      if (result.reason === "not-draft") {
        return res.status(400).json({ success: false, message: "Only Draft invoices can be sent.", status: 400 });
      }
      if (result.reason === "no-email") {
        return res.status(400).json({
          success: false,
          message: "This invoice has no recipient email on file.",
          status: 400,
        });
      }
      return res.status(502).json({
        success: false,
        message: "Unable to send invoice email. Please try again.",
        status: 502,
      });
    }

    return res.status(200).json({
      success: true,
      data: { id: invoice.id, status: 5, balance: result.balance },
      status: 200,
    });
  } catch (error) {
    return actionFailed(res, error, "sending invoice", "Unable to send invoice. Please try again.");
  }
};
