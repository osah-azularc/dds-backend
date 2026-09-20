import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { roundMoney } from "../../../../helpers/timeexpense/invoicing/shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-20
 * @description
 * Time & Expense > Invoicing > View Invoice screen - editing or deleting an
 * *existing* partial payment from the payment-history list (getPartialPaymentDetails
 * / updatePartialPayment / deletePartialPayment in viewInvoice.phtml, backed by
 * InvoicesController::updatePartialPaymentAction/deletePartialPaymentAction). Kept
 * as its own controller file (not added to invoiceActionsController.js, already at
 * this project's ~300-line file-size guideline) - pairs with, but is distinct from,
 * invoiceActionsController.js's addPartialPayment (a *new* payment).
 */

const invoiceNotFound = (res) =>
  res.status(404).json({ success: false, message: "Invoice not found", status: 404 });

const paymentNotFound = (res) =>
  res.status(404).json({ success: false, message: "Payment entry not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Update an existing partial payment's amount/memo - matches
 * updatePartialPaymentAction exactly: the payment row is edited in place (not
 * replaced by a new row), balance is recomputed by backing the old amount out of
 * the invoice's current balance and applying the new one, and status lands on
 * Paid(3) when that zeroes the balance or stays/returns to Partial(6) otherwise.
 * A second inv_logs row is appended on top of the original creation log - legacy
 * does this too (real, traced behavior, not a guess), so the activity log will
 * show both the original "applied" entry and this edit.
 *
 * One legacy quirk reproduced deliberately: the edited row's payment_date/
 * created_by/created_at are all overwritten to "now"/this editor, discarding the
 * original payment date - see updatePartialPaymentBodySchema's own comment for why
 * this schema has no paymentDate field at all (legacy accepts one from the form but
 * never uses it).
 *
 * Unlike legacy (which trusts the client-supplied balance), this refetches the
 * invoice's current balance server-side first - the same "recompute, don't trust
 * the client" posture already used by addPartialPayment/writeOffBalance/
 * resendInvoice elsewhere in this module.
 *
 * A payment entry that's already been deleted (status '0') can't be edited - the
 * client already disables this per legacy's disablePaymentDeleteBtn/
 * disablePaymentInputField, this is the server-side twin of that check.
 * @param {import('express').Request} req - req.body - { paymentAmount, memo } (updatePartialPaymentBodySchema)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const updatePartialPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, paymentId } = req.params;
    const { paymentAmount, memo } = req.body;

    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const payment = await InvoicePartialPayment.findOne({
      where: { id: paymentId, invId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (payment?.status !== "1") {
      await transaction.rollback();
      return paymentNotFound(res);
    }

    const now = new Date();
    const currentBalance = Number(invoice.balance) || 0;
    const oldPartialAmount = Number(payment.partialAmount) || 0;
    const isFullPayoff = paymentAmount === currentBalance;

    const newBalance = isFullPayoff ? 0 : roundMoney(currentBalance + oldPartialAmount - paymentAmount);
    const newStatus = isFullPayoff ? 3 : 6;
    const rowOldInvAmount = isFullPayoff ? currentBalance : roundMoney(paymentAmount + newBalance);
    const rowPartialAmount = isFullPayoff ? roundMoney(paymentAmount + oldPartialAmount) : paymentAmount;

    await payment.update(
      {
        oldInvAmount: rowOldInvAmount,
        partialAmount: rowPartialAmount,
        newInvAmount: newBalance,
        paymentDate: now,
        memo: memo || "",
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
        action: newStatus,
        description: isFullPayoff ? "Invoice marked as Paid" : paymentAmount.toFixed(2),
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
    return actionFailed(res, error, "updating partial payment", "Unable to update payment. Please try again.");
  }
};

/**
 * @description
 * Delete an existing partial payment - matches deletePartialPaymentAction: the
 * payment row is soft-deleted (status '0', never a real DELETE), and the invoice's
 * balance/status is recomputed by adding the deleted amount back. Status returns to
 * Unpaid(5) if this was the only active payment (removing it restores the full
 * invoice amount) or stays Partial(6) if other payments remain applied.
 *
 * Legacy trusts client-supplied balance/inv_amt for this recompute (unlike its own
 * updatePartialPaymentAction, which refetches server-side) - not reproduced here,
 * same "recompute, don't trust the client" posture as the rest of this module.
 *
 * Legacy's own inv_logs.status also disagrees between its two branches (9 in one,
 * 0 in the other) - inv_logs.status is a "0"/"1" ENUM in this app's schema, so a
 * literal 9 isn't even representable; both branches use "1" (active) here, matching
 * every other log entry in this module rather than reproducing what reads as an
 * inconsequential legacy typo (action is already 9, which is what actually
 * distinguishes a deletion in the activity log).
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, status, balance }, status }
 */
export const deletePartialPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, paymentId } = req.params;

    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const payment = await InvoicePartialPayment.findOne({
      where: { id: paymentId, invId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (payment?.status !== "1") {
      await transaction.rollback();
      return paymentNotFound(res);
    }

    const now = new Date();
    const currentBalance = Number(invoice.balance) || 0;
    const partialAmount = Number(payment.partialAmount) || 0;
    const invAmt = Number(invoice.invAmt) || 0;
    const wasOnlyPayment = invAmt === roundMoney(currentBalance + partialAmount);

    const newBalance = wasOnlyPayment ? invAmt : roundMoney(currentBalance + partialAmount);
    const newStatus = wasOnlyPayment ? 5 : 6;

    await payment.update({ status: "0" }, { transaction });
    await invoice.update({ balance: newBalance, status: newStatus }, { transaction });

    await InvLog.create(
      {
        invId: id,
        invNo: invoice.invNo,
        action: 9,
        description: `Invoice Partial Payment of $${partialAmount.toFixed(2)} deleted`,
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
    return actionFailed(res, error, "deleting partial payment", "Unable to delete payment. Please try again.");
  }
};
