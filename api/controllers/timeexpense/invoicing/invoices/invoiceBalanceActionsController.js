import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import InvoiceWrittenOff from "../../../../models/timeexpense/invoicing/InvoiceWrittenOff.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { roundMoney } from "../../../../helpers/timeexpense/invoicing/shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Time & Expense > Invoicing > Invoices tab - the per-row Actions menu's Add
 * Partial Payment / Write Off Balance. Split out of invoiceActionsController.js
 * (2026-08-27, alongside invoiceStatusActionsController.js and
 * invoiceSendActionsController.js) purely to stay under the 300-line file
 * guideline - no behavior change.
 */

const invoiceNotFound = (res) =>
  res.status(404).json({ success: false, message: "Invoice not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Add Partial Payment - matches updatePartialAmountAction (the endpoint
 * addPartialPaymentForm's "Apply Payment" button actually calls - not
 * updatePartialPaymentAction, which is a separate edit-an-existing-payment flow
 * only reachable from View Invoice's own payment history list). Inserts a new
 * invoice_partial_payments row and updates the invoice's own balance/status -
 * status becomes 3 (Paid) when the payment exactly zeroes the balance, else 6
 * (Partial). "Amount greater than balance" is enforced server-side too (legacy
 * only checks this client-side, live, as the user types) - this app's own
 * "recompute/validate, don't trust the client" convention, used consistently
 * elsewhere in this module.
 * @param {import('express').Request} req - req.body - { paymentAmount, paymentDate, memo } (partialPaymentBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const addPartialPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { paymentAmount, paymentDate, memo } = req.body;
    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const currentBalance = Number(invoice.balance) || 0;
    // Matches legacy: base off the current balance, falling back to the full invoice amount
    // only in the (normally unreachable, since this action isn't offered on a $0-balance
    // invoice) case balance is already 0.
    const base = currentBalance === 0 ? Number(invoice.invAmt) || 0 : currentBalance;

    if (paymentAmount > base) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Partial Payment Amount cannot be greater than Invoice Balance Amount",
        status: 400,
      });
    }

    const now = new Date();
    const newBalance = roundMoney(base - paymentAmount);
    const newStatus = newBalance === 0 ? 3 : 6;

    await InvoicePartialPayment.create(
      {
        invId: id,
        oldInvAmount: base,
        partialAmount: paymentAmount,
        newInvAmount: newBalance,
        paymentDate,
        memo: memo || "",
        status: "1",
        createdBy: req.user.userId,
        createdAt: now,
      },
      { transaction },
    );

    await invoice.update({ balance: newBalance, status: newStatus }, { transaction });

    await InvLog.create(
      {
        invId: id,
        invNo: invoice.invNo,
        // Matches legacy exactly - the log description is just the payment amount as a decimal
        // string (e.g. "150.00"), the same in both the full-payoff and still-partial branches;
        // only `action` (the status code) differs between them.
        action: newStatus,
        description: paymentAmount.toFixed(2),
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();
    return res.status(200).json({
      success: true,
      data: { id: invoice.id, status: newStatus, balance: newBalance },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "applying partial payment", "Unable to apply partial payment. Please try again.");
  }
};

/**
 * @description
 * Write Off Balance - matches saveWriteOffAction: snapshots the invoice's
 * pre-write-off status/amount/balance into a new invoice_written_off row (the
 * `reason` the user provided), zeroes the invoice's balance, sets status to 7
 * (Written off), and logs the action with ext_id pointing at the write-off row
 * (mirrors legacy's own inv_logs.ext_id usage, see InvLog.js).
 * @param {import('express').Request} req - req.body - { reason } (writeOffBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const writeOffBalance = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const now = new Date();
    const writeOff = await InvoiceWrittenOff.create(
      {
        invId: id,
        invStatus: invoice.status,
        invAmount: invoice.invAmt,
        invBalance: invoice.balance,
        reason,
        createdBy: req.user.userId,
        createdAt: now,
      },
      { transaction },
    );

    await invoice.update({ balance: 0, status: 7 }, { transaction });

    await InvLog.create(
      {
        invId: id,
        invNo: invoice.invNo,
        extId: writeOff.id,
        action: 7,
        description: "Invoice marked as Written Off",
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();
    return res.status(200).json({ success: true, data: { id: invoice.id, status: 7, balance: 0 }, status: 200 });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "writing off invoice balance", "Unable to write off invoice balance. Please try again.");
  }
};
