import archiver from "archiver";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { buildInvoicePdfBuffer, generateAndSendInvoiceEmail } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Time & Expense > Invoicing > Invoices tab - the top-level "ACTIONS" dropdown
 * above the list (Resend invoice / Mark as Paid / Download), which operates on a
 * set of selected invoice ids. Not to be confused with invoiceActionsController's
 * single-:id actions, which back the row-level three-dot menu.
 *
 * Ported from InvoicesController::markAsPaidBulkAction/bulkInvoiceResendAction/
 * downloadInvoicesAction (osah.repos). Legacy sends the whole invoiceCheked
 * bucket object client-side but only ever reads the plain id arrays server-side
 * (data.selected / data.paid); the frontend here sends the equivalent already-
 * filtered `ids` array directly (see InvoiceListFilters.jsx's Draft-block/
 * Paid-skip logic, ported from performBulkInvoiceAction) - same end result,
 * simpler contract, no dead bucket fields sent over the wire.
 *
 * Legacy has no server-side status revalidation for any of these three (the
 * Draft block is a front-end-only check) - reproduced as-is here, matching
 * invoiceActionsController's markAsPaid/resendInvoice, which are also not
 * status-gated server-side (unlike sendInvoice/deleteInvoice, which are).
 *
 * Each of the three loops per-invoice and keeps going on a single failure,
 * returning a { succeeded, failed } breakdown instead of legacy's single
 * whole-batch response - legacy's own bulk endpoints already behave this way
 * internally (a `foreach` that doesn't stop early), this only makes the partial
 * outcome visible to the caller instead of always reporting blanket success.
 */

/**
 * @description
 * Mark as Paid (bulk) - matches markAsPaidBulkAction: balance to 0, status to 3
 * (Paid), one inv_logs row per invoice. Runs each invoice in its own transaction
 * so one bad id can't roll back the rest of the batch.
 * @param {import('express').Request} req - req.body - { ids: [invoices.id, ...] } (bulkInvoiceIdsBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { succeeded: [id...], failed: [{ id, message }...] }, status }
 */
export const markAsPaidBulk = async (req, res) => {
  const { ids } = req.body;
  const results = { succeeded: [], failed: [] };

  for (const id of ids) {
    const transaction = await sequelize.transaction();
    try {
      const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) {
        await transaction.rollback();
        results.failed.push({ id, message: "Invoice not found" });
        continue;
      }

      const now = new Date();
      await invoice.update({ balance: 0, status: 3 }, { transaction });
      await InvLog.create(
        {
          invId: invoice.id,
          invNo: invoice.invNo,
          action: 3,
          description: "Invoice marked as Paid",
          status: "1",
          createdAt: now,
          createdBy: req.user.userId,
        },
        { transaction },
      );

      await transaction.commit();
      results.succeeded.push(id);
    } catch (error) {
      await transaction.rollback();
      logger.error("Error marking invoice as paid (bulk):", { id, error: error.message, stack: error.stack });
      results.failed.push({ id, message: "Unable to mark invoice as paid" });
    }
  }

  return res.status(200).json({ success: true, data: results, status: 200 });
};

/**
 * @description
 * Resend (bulk) - matches bulkInvoiceResendAction: regenerates + re-sends the PDF
 * invoice email per invoice, reusing the exact same helper the row-level Resend/
 * Send actions use (generateAndSendInvoiceEmail), and deactivates stale
 * invoice_partial_payments rows for a non-Partial invoice, same as the single-id
 * resendInvoice.
 * @param {import('express').Request} req - req.body - { ids: [invoices.id, ...] } (bulkInvoiceIdsBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { succeeded: [id...], failed: [{ id, message }...] }, status }
 */
export const resendBulk = async (req, res) => {
  const { ids } = req.body;
  const results = { succeeded: [], failed: [] };

  for (const id of ids) {
    try {
      const invoice = await Invoice.findByPk(id);
      if (!invoice) {
        results.failed.push({ id, message: "Invoice not found" });
        continue;
      }
      if (!invoice.agencyEmail) {
        results.failed.push({ id, message: "This invoice has no recipient email on file." });
        continue;
      }

      const items = await InvoiceItem.findAll({ where: { invId: id, isDeleted: 0 } });
      const emailResult = await generateAndSendInvoiceEmail(
        invoice.toJSON(),
        items.map((item) => item.toJSON()),
      );

      if (!emailResult.success) {
        results.failed.push({ id, message: "Unable to resend invoice email." });
        continue;
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

      results.succeeded.push(id);
    } catch (error) {
      logger.error("Error resending invoice (bulk):", { id, error: error.message, stack: error.stack });
      results.failed.push({ id, message: "Unable to resend invoice" });
    }
  }

  return res.status(200).json({ success: true, data: results, status: 200 });
};

/**
 * @description
 * Download (bulk) - matches downloadInvoicesAction/createInvoiceZip: one PDF per
 * selected invoice, zipped together. Legacy generates the zip to a shared
 * on-disk staging directory, returns a token, and round-trips the browser through
 * a second, generic zip-streaming action to fetch it; this streams the zip
 * straight back on the same request/response instead (in-memory, via archiver,
 * same library/pattern already used by searchResultsPrintController.js's
 * calendar-PDF zip) - a deliberate simplification, not a different feature: the
 * end result for the user (one .zip of the selected invoices' PDFs) is identical,
 * without legacy's shared-staging-directory race risk (deleteOldContent wipes a
 * single, non-per-request directory on every call).
 *
 * A single invoice's PDF failing to generate does not fail the whole download -
 * it's just omitted from the zip (logged) - matches legacy's own createInvoiceZip
 * loop, which never aborts on one bad generateSummary call either.
 * @param {import('express').Request} req - req.body - { ids: [invoices.id, ...] } (bulkInvoiceIdsBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} application/zip (attachment) - or a JSON error before any bytes are written.
 */
export const downloadInvoicesBulk = async (req, res) => {
  try {
    const { ids } = req.body;
    const invoices = await Invoice.findAll({ where: { id: ids } });

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Respective documents do not exist",
        status: 404,
      });
    }

    const zipFileName = `invoices_${Date.now()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("warning", (err) => {
      logger.warn("Bulk invoice download archive warning:", { error: err.message });
    });
    archive.on("error", (error) => {
      logger.error("Error building bulk invoice zip:", { error: error.message, stack: error.stack });
      // Headers/data are almost certainly already flushed to the client by the time archiver can
      // error mid-stream - nothing left to do but end the response; a JSON error body here would
      // just get appended after already-sent zip bytes and corrupt the download either way.
      res.end();
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const invoice of invoices) {
      try {
        const items = await InvoiceItem.findAll({ where: { invId: invoice.id, isDeleted: 0 } });
        const pdfBuffer = await buildInvoicePdfBuffer(invoice.toJSON(), items.map((item) => item.toJSON()));

        // invNo (e.g. "2026/08-0199") contains a literal "/" - archiver treats any "/" in a zip
        // entry name as a path separator, so using it unsanitized silently nests PDFs into a
        // "2026/" subfolder instead of the flat file list a "Download" is expected to produce.
        // Replaced with "-" for the archive entry name only; the PDF's own content/filename-
        // adjacent invNo display elsewhere is untouched.
        const safeInvNo = String(invoice.invNo).replaceAll(/[/\\]/g, "-");

        // invNo should already be unique, but guard the zip entry name anyway rather than
        // silently overwriting one invoice's PDF with another's inside the archive.
        let entryName = `${safeInvNo}.pdf`;
        if (usedNames.has(entryName)) {
          entryName = `${safeInvNo}_${invoice.id}.pdf`;
        }
        usedNames.add(entryName);

        archive.append(pdfBuffer, { name: entryName });
      } catch (itemError) {
        logger.error("Error generating PDF for bulk invoice download:", {
          id: invoice.id,
          error: itemError.message,
          stack: itemError.stack,
        });
      }
    }

    await archive.finalize();
    return undefined;
  } catch (error) {
    logger.error("Error downloading invoices (bulk):", { error: error.message, stack: error.stack });
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate invoice documents. Please try again.",
        status: 500,
      });
    }
    return res.end();
  }
};
