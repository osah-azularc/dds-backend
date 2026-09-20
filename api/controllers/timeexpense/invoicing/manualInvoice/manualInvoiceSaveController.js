import dayjs from "dayjs";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  validateBillingPeriod,
  computeInvoiceFinancials,
  computeDueDateAndStatus,
  buildInvoiceItemRows,
  buildBillableInvoiceItemRows,
  resolveAndValidateBillableItems,
} from "../../../../helpers/timeexpense/invoicing/shared/manualInvoiceHelpers.js";
import { linkBillableItemsToInvoice } from "../../../../helpers/timeexpense/invoicing/shared/billableLinkageHelpers.js";
import { finalizeInvoiceSave } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > New Invoice Draft screen: saveManualInvoice.
 * Split out of manualInvoiceController.js (2026-08-27, alongside
 * manualInvoiceUpdateController.js) purely to stay under the 300-line file
 * guideline, matching this same PR's existing bulkInvoiceCreateController.js/
 * bulkInvoiceGenerateController.js/bulkInvoiceSendController.js precedent of one
 * action-scoped controller file per write action - no behavior change.
 * updateManualInvoice lives in manualInvoiceUpdateController.js;
 * getRemitDetails (the one read-only endpoint this module still owns) stays in
 * manualInvoiceController.js.
 */

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > New Invoice Draft screen: saves a manual invoice.
 * Case Referral Fee, typed-in-quantity/rate catalog task/expense-type rows
 * (itemCatalogHelpers.js), and Add-Billable-Activity-picked rows (real
 * time_entry/expense_entry rows, linked via billableLinkageHelpers.js) can all
 * appear in the same invoice. sendInvoiceStatus true = "Send Invoice" (status
 * lands on 5/Unpaid, PDF generated and emailed after save); false/omitted =
 * "Save Draft" (status 2). Either way an already-past-due date still wins and
 * lands on 4 - and, matching legacy's own `$invoiceStatus == 5 || $invoiceStatus
 * == 4` trigger, the PDF still gets generated and emailed in that case too, even
 * though the user only clicked Save Draft (see shouldSend below).
 * @param {import('express').Request} req - req.body - see saveManualInvoiceBodySchema (agencyId, email, billDateFrom/To, invoiceDate, days, memo, discount, discountDesc, remitInformation, taxInformation, address, items[], sendInvoiceStatus)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, invNo, status, emailResult? } , status } - emailResult ({ success, sentCount, failedCount }) is present whenever the computed status is 4 or 5 (see shouldSend), not only when sendInvoiceStatus was true.
 */
export const saveManualInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
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

    const billableItems = items.filter((item) => item.billable);
    const { resolvedDetails, error: billableError } = await resolveAndValidateBillableItems(
      billableItems,
      billableItems,
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

    // KNOWN GAP, carried over from legacy on purpose (parity audit 2026-08-18): this
    // read-then-increment isn't row-locked, so two saves committed at the same instant can
    // both read the same lastId and generate the same inv_no. legacy's saveInvoiceAction has
    // this exact race (a plain `SELECT ... ORDER BY id DESC LIMIT 1` with no lock, no unique
    // constraint on inv_no) - wrapping this in a transaction here doesn't close it by itself,
    // since a second transaction's own unlocked SELECT can still run before the first commits.
    // Left as-is per team decision rather than silently changing invoice-numbering concurrency
    // behavior; closing it for real needs either a `lock: transaction.LOCK.UPDATE` read (with
    // care - see the analysis notes on why a naive row lock doesn't fully serialize this) or a
    // dedicated sequence/unique-constraint-plus-retry, either of which is a deliberate follow-up
    // decision, not a drive-by fix.
    const lastInvoice = await Invoice.findOne({ order: [["id", "DESC"]], transaction });
    const lastId = lastInvoice ? lastInvoice.id : 0;
    const invNo = `${dayjs().format("YYYY")}/${dayjs().format("MM")}-${String(lastId + 1).padStart(4, "0")}`;

    const { invDueDate, status } = computeDueDateAndStatus(invoiceDate, days, sendInvoiceStatus);
    const now = new Date();

    const invoice = await Invoice.create(
      {
        invNo,
        invDate: invoiceDate,
        billDateFrom: billDateFrom || null,
        billDateTo: billDateTo || null,
        agency: agencyId,
        agencyName: agency.agencyDescription || "",
        agencyEmail: email,
        // Legacy genuinely stores the agency id in invoices.user_id for manual invoices, not a
        // real user reference - kept as-is for fidelity (InvoicesController::saveInvoiceAction).
        userId: agencyId,
        bulkInvGrp: "-",
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
        isDeleted: 0,
        actions: String(status),
        invDueDate,
        createdDate: now,
        createdBy: req.user.userId,
        modifiedDate: now,
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    const itemRowArgs = { invId: invoice.id, invNo, createdBy: req.user.userId, now };
    const itemRows = [
      ...buildInvoiceItemRows(items, itemRowArgs),
      ...buildBillableInvoiceItemRows(items, resolvedDetails, itemRowArgs),
    ];
    await InvoiceItem.bulkCreate(itemRows, { transaction });

    // Links each billable item back to its source time_entry/expense_entry row (CSV columns +
    // is_posted) - matches legacy's saveInvoiceAction, run immediately after the invoice_items
    // insert, still inside the same transaction.
    await linkBillableItemsToInvoice(billableItems, {
      agencyId,
      invoiceId: invoice.id,
      invNo,
      transaction,
    });

    // BUG FIX 2026-09-03 (parity audit): legacy's own trigger for both the email send AND this
    // log's description is the *computed* status, not which button was clicked -
    // saveInvoiceAction's `if($invoiceStatus == 5 || $invoiceStatus == 4){ ...sendInvoice... }`
    // and `'description' => $invoiceStatus == 2 ? 'Invoice created' : 'Invoice sent'`. A plain
    // Save Draft with an already-past invoice date lands on status 4 (Overdue) via
    // computeDueDateAndStatus's own create-only override - legacy sends the invoice to the
    // agency in that case even though the user only clicked Save Draft, and logs it as "Invoice
    // sent", not "Invoice created". Previously this checked `sendInvoiceStatus` (the literal
    // button clicked) instead, which never sent that email and mislabeled the log. Edit's own
    // send trigger (updateManualInvoice/finalizeInvoiceSave's other caller) is a separate,
    // broader legacy condition (`in_array($status, [4,5,6,7])`) - intentionally left untouched
    // here, not in scope of this fix.
    const shouldSend = status === 5 || status === 4;

    // Legacy always writes an inv_logs row on save, regardless of status (saveInvoiceAction's
    // final $logs insert).
    await InvLog.create(
      {
        invId: invoice.id,
        invNo,
        action: status,
        description: status === 2 ? "Invoice created" : "Invoice sent",
        status: "1",
        createdAt: now,
        createdBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();

    // Runs after commit, on purpose - a failed send shouldn't roll back an invoice that's
    // already correctly saved (matches legacy: saveInvoiceAction never undoes the insert if
    // InvoiceModel::sendInvoice fails, it just reports the failure back).
    const data = await finalizeInvoiceSave(invoice, itemRows, shouldSend, status);

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error saving manual invoice:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to save invoice. Please try again.",
      status: 500,
    });
  }
};
