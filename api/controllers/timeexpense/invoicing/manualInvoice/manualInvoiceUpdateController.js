import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  isManualInvoice,
  isReplaceableItem,
  isBillableSourced,
  validateBillingPeriod,
  computeInvoiceFinancials,
  computeDueDateAndStatus,
  buildInvoiceItemRows,
  buildBillableInvoiceItemRows,
  resolveAndValidateBillableItems,
} from "../../../../helpers/timeexpense/invoicing/shared/manualInvoiceHelpers.js";
import {
  linkBillableItemsToInvoice,
  unlinkBillableItemsFromInvoice,
} from "../../../../helpers/timeexpense/invoicing/shared/billableLinkageHelpers.js";
import { finalizeInvoiceSave } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Edit Invoice screen: updateManualInvoice. Split
 * out of manualInvoiceController.js (2026-08-27, alongside
 * manualInvoiceSaveController.js) purely to stay under the 300-line file
 * guideline, matching this same PR's existing bulkInvoiceCreateController.js/
 * bulkInvoiceGenerateController.js/bulkInvoiceSendController.js precedent of one
 * action-scoped controller file per write action - no behavior change.
 * saveManualInvoice lives in manualInvoiceSaveController.js; getRemitDetails
 * (the one read-only endpoint this module still owns) stays in
 * manualInvoiceController.js.
 */

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Edit Invoice screen: resaves a manual invoice -
 * both manually-typed and billable-activity-sourced line items (see
 * isReplaceableItem). Item replacement is still all-or-nothing (delete every
 * InvoiceItem row, re-insert the full submitted set), but billable items are
 * reconciled individually against their source time_entry/expense_entry rows:
 * ones present before and after are left linked as-is, ones newly added get
 * linked, ones dropped get unlinked - mirrors updateInvoiceAction's
 * removeEntries reconciliation (~2728-2791) without requiring the client to
 * separately track which rows it removed (this diffs the invoice's own prior
 * items against the new submission server-side instead).
 * Emailing on send: matches legacy's own `in_array($status, [4, 5, 6, 7])` trigger
 * (the *computed* status, not sendInvoiceStatus) - see this function's own
 * shouldSend comment below.
 * @param {import('express').Request} req - req.params.id, req.body - same shape as saveManualInvoiceBodySchema
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, invNo, status, emailResult? }, status }
 */
export const updateManualInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      agencyId,
      email,
      billDateFrom,
      billDateTo,
      invoiceDate,
      days,
      memo,
      discount,
      discountDesc,
      remitInformation,
      taxInformation,
      address,
      items,
      sendInvoiceStatus,
    } = req.body;

    const invoice = await Invoice.findOne({
      where: { id, isDeleted: 0 },
      include: [{ model: InvoiceItem, as: "items", required: false }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Invoice not found", status: 404 });
    }

    // Same eligibility rule as getInvoiceDetails's isEditable - kept in sync so a GET that says
    // editable can't turn around and have its PUT rejected (or vice versa). Matches legacy's own
    // editInvoiceForm()/editinvoice.phtml, which has no status restriction at all - any invoice
    // can be edited regardless of Draft/Paid/Overdue/Unpaid/Partial/Written off. Not restricted
    // to manual (non-bulk) invoices with replaceable items only, since bulk-linked line items
    // don't come from this form's own item catalog at all.
    const canReplaceItems = (invoice.items || []).every(isReplaceableItem);
    if (!isManualInvoice(invoice.bulkInvGrp) || !canReplaceItems) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "This invoice can't be edited yet - only manual invoices are editable.",
        status: 400,
      });
    }

    const billingPeriodError = validateBillingPeriod(billDateFrom, billDateTo);
    if (billingPeriodError) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: billingPeriodError, status: 400 });
    }

    const agency = await BillableAgency.findByPk(agencyId, { transaction });
    if (!agency) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Agency not found", status: 400 });
    }

    // Diffs the invoice's PRIOR billable items against the newly-submitted set: kept items need
    // no re-validation or re-linking (they're already correctly linked from their original
    // save); only genuinely new picks get validated against "already added for this agency",
    // and only genuinely dropped items get unlinked. See resolveAndValidateBillableItems's own
    // doc comment for why kept items can't be validated against themselves.
    const existingBillableKeys = new Set(
      (invoice.items || [])
        .filter(isBillableSourced)
        .map((item) => `${item.itemType}-${item.expense}`),
    );
    const newBillableItems = items.filter((item) => item.billable);
    const newBillableKeys = new Set(newBillableItems.map((item) => `${item.itemType}-${item.itemCode}`));
    const addedBillableItems = newBillableItems.filter(
      (item) => !existingBillableKeys.has(`${item.itemType}-${item.itemCode}`),
    );
    const removedBillableItems = (invoice.items || [])
      .filter(isBillableSourced)
      .filter((item) => !newBillableKeys.has(`${item.itemType}-${item.expense}`))
      .map((item) => ({ itemType: item.itemType, itemCode: item.expense, billable: true }));

    const { resolvedDetails, error: billableError } = await resolveAndValidateBillableItems(
      newBillableItems,
      addedBillableItems,
      agencyId,
    );
    if (billableError) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: billableError, status: 400 });
    }

    const {
      subtotal,
      total,
      error: financialsError,
    } = computeInvoiceFinancials(items, discount, resolvedDetails);
    if (financialsError) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: financialsError, status: 400 });
    }

    // Passes the invoice's pre-update status through - see computeDueDateAndStatus's own doc
    // comment for the real branching this reproduces (Save Draft always resets to Draft
    // regardless of current status; Send Invoice only promotes an actual Draft to Unpaid,
    // otherwise leaves the current status as-is).
    const { invDueDate, status } = computeDueDateAndStatus(
      invoiceDate,
      days,
      sendInvoiceStatus,
      invoice.status,
    );
    const now = new Date();

    await invoice.update(
      {
        invDate: invoiceDate,
        billDateFrom: billDateFrom || null,
        billDateTo: billDateTo || null,
        agency: agencyId,
        agencyName: agency.agencyDescription || "",
        agencyEmail: email,
        userId: agencyId,
        discount,
        discountDesc,
        memo,
        subtotal,
        invAmt: total,
        balance: total,
        dueDate: days,
        remitInformation,
        address,
        taxInformation,
        status,
        // Legacy's updateInvoiceAction hardcodes 'actions' => "2" here regardless of the
        // computed status (unlike saveInvoiceAction, which sets it dynamically) - looks like a
        // copy-paste bug rather than a deliberate rule, so this keeps it in sync with status
        // the same way create does.
        actions: String(status),
        invDueDate,
        modifiedDate: now,
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    await InvoiceItem.destroy({ where: { invId: invoice.id }, transaction });
    const itemRowArgs = { invId: invoice.id, invNo: invoice.invNo, createdBy: req.user.userId, now };
    const itemRows = [
      ...buildInvoiceItemRows(items, itemRowArgs),
      ...buildBillableInvoiceItemRows(items, resolvedDetails, itemRowArgs),
    ];
    await InvoiceItem.bulkCreate(itemRows, { transaction });

    // Only reconcile the delta - items unchanged across the edit stay linked exactly as they
    // were, avoiding redundant writes (and, for expense entries, avoiding a spurious is_posted
    // recompute) on every resave.
    await linkBillableItemsToInvoice(addedBillableItems, {
      agencyId,
      invoiceId: invoice.id,
      invNo: invoice.invNo,
      transaction,
    });
    await unlinkBillableItemsFromInvoice(removedBillableItems, {
      agencyId,
      invoiceId: invoice.id,
      invNo: invoice.invNo,
      transaction,
    });

    await InvLog.create(
      {
        invId: invoice.id,
        invNo: invoice.invNo,
        action: status,
        description: sendInvoiceStatus ? "Invoice sent" : "Invoice modified",
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();

    // BUG FIX 2026-09-03 (parity audit): legacy's own resend trigger here is
    // `in_array($status, [4, 5, 6, 7])` - the *computed* status, not `sendInvoiceStatus` (the
    // literal button clicked). From this screen, computeDueDateAndStatus's own branching means
    // that in practice covers: Send Invoice on a Draft (status 2->5) - the common case, still
    // sends exactly as before; Send Invoice while the invoice's current status is already
    // Overdue/Unpaid/Partial/Written off (4/5/6/7, left unchanged by computeDueDateAndStatus's
    // own non-Draft branch) - now also resends, matching legacy. Previously this checked
    // `sendInvoiceStatus` alone, which over-sent relative to legacy for one real case: clicking
    // Send while the current status is Paid(3) - legacy's own array deliberately excludes 3, so
    // it does NOT resend a Paid invoice's email even if Send is clicked; the old check would have
    // sent one anyway. Save Draft (status always resets to 2) still never sends, matching legacy.
    const shouldSend = [4, 5, 6, 7].includes(status);
    // Runs after commit - see saveManualInvoice's own note on why a failed send doesn't undo
    // an already-committed save.
    const data = await finalizeInvoiceSave(invoice, itemRows, shouldSend, status);

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error updating manual invoice:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to update invoice. Please try again.",
      status: 500,
    });
  }
};
