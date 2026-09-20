import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { sendDraftInvoice } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail > Invoices tab > Send Invoices. Ported from
 * BulkinvoicesController::sendBulkInvoicesAction - reuses sendDraftInvoice
 * (invoiceSendHelpers.js, extracted from the already-shipped single-invoice Send
 * action - invoiceActionsController.js) for each Draft invoice in the group,
 * instead of re-deriving the PDF+email+status-flip sequence a second time.
 *
 * No shared transaction, deliberately - matches legacy exactly: each invoice's
 * send is independent (if invoice 3 of 5 fails, invoices 1-2 stay sent, they
 * don't roll back). Sequential, not Promise.all - keeps load on the email
 * provider/S3 predictable, same as Generate Invoices' own per-agency loop.
 *
 * Legacy's own email-validation loop (computed but never actually read by the
 * frontend success handler) is not ported - same finding as Generate Invoices'
 * own doc comment: the real "Missing Information" banner is already recomputed
 * fresh on every read of this tab (bulkInvoiceInvoiceCorrectionHelpers.js).
 * @returns {*} { success, data: { bulkInvoiceId, sentCount, failedCount, failures: [{ invNo, agencyName, message }] }, status }
 */
export const sendBulkInvoices = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await BulkInvoice.findOne({ where: { bulkInvoiceId: id } });
    if (!group) {
      return res.status(404).json({ success: false, message: "Bulk invoice group not found", status: 404 });
    }

    // Matches legacy's own SQL exactly: the JOIN pulls every invoice tied to this group
    // regardless of status (only the PHP loop's own `if($invoice['status']==2)` check decides
    // which ones actually get sent) - the group-has-any-invoices-at-all gate below is computed
    // from this unfiltered set, not just the Draft subset, for a confirmed reason (see below).
    const allGroupInvoices = await Invoice.findAll({
      where: { bulkInvGrp: String(id), isDeleted: 0 },
    });
    const invoices = allGroupInvoices.filter((invoice) => invoice.status === 2);

    const failures = [];
    let sentCount = 0;
    for (const invoice of invoices) {
      const result = await sendDraftInvoice(invoice, { userId: req.user.userId });
      if (result.success) {
        sentCount += 1;
      } else {
        failures.push({
          invNo: invoice.invNo,
          agencyName: invoice.agencyName,
          message: `Unable to send Invoice No: ${invoice.invNo} for Email Address: ${invoice.agencyEmail || ""}`,
        });
      }
    }

    // Matches legacy's own $bulkInvoiceflag gate - the group only flips to "fully sent" (status 1)
    // when every Draft invoice in it sent successfully; any failure leaves it as-is so a retry
    // only has to re-send the ones that actually failed (Invoice.status still 2 for those).
    //
    // Gated on allGroupInvoices.length (not invoices.length) deliberately - confirmed real,
    // reachable divergence from a naive Draft-only gate (2026-08-28): nothing prevents an
    // individual invoice from being marked Paid/Written-off/Sent independently from the regular
    // Invoice List (see bulkInvoiceController.js's own deleteBulkInvoiceGroup comment on the same
    // fact). If every invoice in the group has already left Draft that way, invoices.length is 0
    // here even though the group has real invoices - legacy's own unfiltered JOIN still sees them
    // and still flips bulk_invoices.status to 1 (failures stays empty, nothing to fail). Gating on
    // invoices.length instead would leave a fully-resolved group stuck showing Draft forever, with
    // a re-click of Send Invoices doing nothing (0 sent, 0 failed) to ever fix it.
    if (allGroupInvoices.length > 0 && failures.length === 0) {
      await group.update({ status: "1", modifiedBy: req.user.userId, modifiedAt: new Date() });
    }

    return res.status(200).json({
      success: true,
      data: { bulkInvoiceId: Number(id), sentCount, failedCount: failures.length, failures },
      status: 200,
    });
  } catch (error) {
    logger.error("Error sending bulk invoices:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to send invoices for this bulk invoice group. Please try again.",
      status: 500,
    });
  }
};
