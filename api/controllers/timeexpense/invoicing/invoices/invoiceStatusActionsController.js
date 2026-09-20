import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Time & Expense > Invoicing > Invoices tab - the per-row Actions menu's Mark as
 * Paid / Mark as Unpaid. Split out of invoiceActionsController.js (2026-08-27,
 * alongside invoiceBalanceActionsController.js and invoiceSendActionsController.js)
 * purely to stay under the 300-line file guideline - no behavior change.
 * Delete (deleteInvoiceRecord/deleteInvoice) stays in invoiceActionsController.js,
 * since deleteInvoiceRecord is also imported directly by bulkInvoiceController.js.
 */

const invoiceNotFound = (res) =>
  res.status(404).json({ success: false, message: "Invoice not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Mark as Paid - matches markAsPaidAction exactly: balance to 0, status to 3
 * (Paid). No confirmation dialog in legacy, no payment record created despite
 * the name - just the invoice fields + an audit log row.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const markAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return invoiceNotFound(res);

    const now = new Date();
    await invoice.update({ balance: 0, status: 3 });
    await InvLog.create({
      invId: invoice.id,
      invNo: invoice.invNo,
      action: 3,
      description: "Invoice marked as Paid",
      status: "1",
      createdAt: now,
      createdBy: req.user.userId,
    });

    return res.status(200).json({ success: true, data: { id: invoice.id, status: 3, balance: 0 }, status: 200 });
  } catch (error) {
    return actionFailed(res, error, "marking invoice as paid", "Unable to mark invoice as paid. Please try again.");
  }
};

/**
 * @description
 * Mark as Unpaid - the counter-action shown for both Paid(3) and Written off(7)
 * rows. Matches markAsUnpaidAction: balance back to the full invoice amount,
 * status to 5 (Unpaid), and every invoice_partial_payments row for this invoice
 * deactivated (status 0) - legacy does NOT reverse invoice_written_off, that
 * history row is left in place as an audit trail even after undoing the write-off
 * (verified against source, not an oversight to "fix" here).
 *
 * Log description deliberately reads "Invoice marked as Unpaid" here, not
 * legacy's literal `"Invoice marked as"` (missing the status word entirely) -
 * that's a plain legacy copy typo, not a business-rule quirk, and this text is
 * shown to real users on the View Invoice activity log tab.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const markAsUnpaid = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const now = new Date();
    const restoredBalance = invoice.invAmt;
    await invoice.update({ balance: restoredBalance, status: 5 }, { transaction });
    await InvoicePartialPayment.update(
      { status: "0" },
      { where: { invId: id }, transaction },
    );
    await InvLog.create(
      {
        invId: invoice.id,
        invNo: invoice.invNo,
        action: 5,
        description: "Invoice marked as Unpaid",
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();
    return res.status(200).json({
      success: true,
      data: { id: invoice.id, status: 5, balance: restoredBalance },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "marking invoice as unpaid", "Unable to mark invoice as unpaid. Please try again.");
  }
};
