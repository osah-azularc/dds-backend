import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { isBillableSourced } from "../../../../helpers/timeexpense/invoicing/shared/manualInvoiceHelpers.js";
import { unlinkBillableItemsFromInvoice } from "../../../../helpers/timeexpense/invoicing/shared/billableLinkageHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Time & Expense > Invoicing > Invoices tab - the per-row Actions menu's Delete.
 * Ported from InvoicesController::deleteInvoiceAction (osah.repos) - the UI/menu
 * itself already existed (invoiceListColumns.jsx), this closes the "visible but
 * not wired" gap behind it.
 *
 * Mark as Paid/Unpaid, Add Partial Payment, Write Off Balance, Resend, and Send
 * (this file's original siblings) moved out (2026-08-27) to
 * invoiceStatusActionsController.js / invoiceBalanceActionsController.js /
 * invoiceSendActionsController.js respectively, purely to stay under the
 * 300-line file guideline - no behavior change. Delete stays here since
 * deleteInvoiceRecord is also imported directly by bulkInvoiceController.js's
 * own Delete Draft cascade.
 *
 * Every mutation here shares legacy's one blanket auth gate (requireBillingAccess,
 * same as every other invoicing route) - legacy has no finer-grained per-action
 * permission split to preserve.
 */

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * Delete - matches deleteInvoiceAction: soft-deletes the invoice and its
 * invoice_items (is_deleted=1, never a real DELETE), and unlinks every
 * billable-sourced item back to its source time_entry/expense_entry row - the
 * exact same CSV-unlink logic unlinkBillableItemsFromInvoice already implements
 * (built for Edit Invoice's remove-billable-item path), reused here rather than
 * re-derived, since legacy's own condition for "which items get unlinked"
 * (`item_type != 'other' and item_name != 'manual'`) is byte-for-byte the same
 * check isBillableSourced already encodes.
 *
 * One deliberate improvement: legacy's deleteInvoiceAction has no status check
 * at all (only the UI hides Delete for non-Draft rows) - this app's own
 * "backend must not rely on frontend-only checks" convention (used everywhere
 * else financial state is involved) adds one here, since deleting a Paid/Sent
 * invoice's records would be a real data-integrity problem legacy just happens
 * to never trigger because its own UI never offers the button outside Draft.
 *
 * Split into deleteInvoiceRecord (the part that touches the DB, takes an existing
 * transaction, never commits/rolls back itself) + this thin request/response
 * wrapper, so Bulk Invoice Groups' own Delete Draft (bulkInvoiceController.js's
 * deleteBulkInvoiceGroup) can cascade this exact routine per invoice in the group
 * inside one shared transaction - see that controller's comment for why the group
 * delete aborts entirely on the first invoice failure rather than best-effort
 * cascading the way legacy's deleteEachInvoice silently does.
 *
 * `stampModified` (default false) controls one real, confirmed divergence between
 * the two legacy callers: InvoicesController::deleteInvoiceAction (this file's own
 * single-invoice Delete) never stamps modified_by/modified_date on the invoices
 * row it soft-deletes, but BulkinvoicesController::deleteEachInvoice - the actual,
 * live cascade behind Bulk Invoice Groups' own Delete Draft - does. Confirmed by
 * reading both legacy actions directly, not assumed from one covering the other
 * (see bulkInvoiceController.js's deleteBulkInvoiceGroup, which passes true).
 * @param {*} id
 * @param {*} transaction
 * @param {*} userId
 * @param {Object} [options]
 * @param {boolean} [options.stampModified] - also set modifiedBy/modifiedDate on the invoice row (Bulk Invoice Groups' cascade only - see above)
 * @returns {*} { success, data: { id }, status }
 */
export const deleteInvoiceRecord = async (id, transaction, userId, { stampModified = false } = {}) => {
  const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!invoice) {
    return { ok: false, status: 404, message: "Invoice not found" };
  }
  if (invoice.status !== 2) {
    return { ok: false, status: 400, message: "Only Draft invoices can be deleted." };
  }

  const items = await InvoiceItem.findAll({ where: { invId: id, isDeleted: 0 }, transaction });

  await invoice.update(
    {
      isDeleted: 1,
      ...(stampModified ? { modifiedBy: userId, modifiedDate: new Date() } : {}),
    },
    { transaction },
  );
  await InvoiceItem.update({ isDeleted: 1 }, { where: { invId: id }, transaction });

  const billableItems = items
    .filter((item) => isBillableSourced(item))
    .map((item) => ({ itemType: item.itemType, itemCode: item.expense, billable: true }));
  if (billableItems.length > 0) {
    await unlinkBillableItemsFromInvoice(billableItems, {
      agencyId: invoice.agency,
      invoiceId: invoice.id,
      invNo: invoice.invNo,
      transaction,
    });
  }

  await InvLog.create(
    {
      invId: id,
      invNo: invoice.invNo,
      action: 9,
      description: "Invoice Deleted",
      status: "1",
      createdAt: new Date(),
      createdBy: userId,
    },
    { transaction },
  );

  return { ok: true, id: invoice.id };
};

export const deleteInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const result = await deleteInvoiceRecord(id, transaction, req.user.userId);
    if (!result.ok) {
      await transaction.rollback();
      return res
        .status(result.status)
        .json({ success: false, message: result.message, status: result.status });
    }

    await transaction.commit();
    return res.status(200).json({ success: true, data: { id: result.id }, status: 200 });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "deleting invoice", "Unable to delete invoice. Please try again.");
  }
};
