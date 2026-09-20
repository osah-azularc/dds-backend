import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import InvoicePartialPayment from "../../../../models/timeexpense/invoicing/InvoicePartialPayment.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  MANUAL_ITEM_PROFESSIONAL,
  isManualInvoice,
  isReplaceableItem,
  isBillableSourced,
  nullifyZeroDate,
} from "../../../../helpers/timeexpense/invoicing/shared/manualInvoiceHelpers.js";
import { getItemCatalog } from "../../../../helpers/timeexpense/invoicing/shared/itemCatalogHelpers.js";
import { roundMoney, sumItemTotals } from "../../../../helpers/timeexpense/invoicing/shared/computationHelpers.js";

/**
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Time & Expense > Invoicing > View Invoice screen's read-only endpoints -
 * invoice + line items, and partial payment history. The activity/audit log
 * moved to invoiceActivityLogController.js (its own ext_id enrichment pushed
 * this file over the 300-line guideline); the CSV export (exportInvoiceItems)
 * moved to invoiceItemsExportController.js (2026-08-27, same reason). Split
 * out of manualInvoiceController.js (which keeps the write path -
 * getRemitDetails/saveManualInvoice/updateManualInvoice) purely to stay under
 * that guideline; no behavior change.
 */

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > View/Edit Invoice screens: loads an invoice and
 * its line items. isEditable matches legacy's editInvoiceForm()/editinvoice.phtml,
 * which has no status restriction at all - any manual (non-bulk-linked) invoice
 * is editable regardless of Draft/Paid/Overdue/Unpaid/Partial/Written off, so
 * long as every item is something this form can safely re-save
 * (isReplaceableItem) - both manually-typed and billable-activity-sourced line
 * items are re-savable now.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: (Invoice fields & { agencyCode, isEditable, items: (InvoiceItem & { isBillable })[] }), status }
 */
export const getInvoiceDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, isDeleted: 0 },
      include: [
        { model: BillableAgency, as: "billableAgency", attributes: ["agencyCode"], required: false },
        { model: InvoiceItem, as: "items", required: false },
      ],
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
        data: null,
        status: 404,
      });
    }

    const plain = invoice.toJSON();

    // Resolves each item's professional to a name. For 'other' (Case Referral Fee) items this
    // is always the 9999 sentinel and never resolves. For 'time'/'expense' items it's usually a
    // real judge_assistant_clerk id - except an AAA time item, where the same field instead
    // holds a time_entry_billing_roles.id (see checkAllLineItems - the Professional select is
    // swapped for a Role select, but both bind the same underlying item.professional). Both
    // tables are looked up by the same id set; whichever one actually matches wins.
    const candidateIds = [
      ...new Set(
        (plain.items || [])
          .map((item) => item.professional)
          .filter((professional) => professional && professional !== MANUAL_ITEM_PROFESSIONAL),
      ),
    ];
    const [professionals, roles] = candidateIds.length
      ? await Promise.all([
          JudgeAssistantClerk.findAll({
            where: { userId: candidateIds },
            attributes: ["userId", "firstName", "lastName"],
          }),
          TimeEntryBillingRole.findAll({
            where: { id: candidateIds },
            attributes: ["id", "subTypeRole"],
          }),
        ])
      : [[], []];
    const professionalById = new Map(
      professionals.map((person) => [person.userId, `${person.firstName} ${person.lastName}`]),
    );
    const roleById = new Map(roles.map((role) => [role.id, (role.subTypeRole || "").toUpperCase()]));

    // A manually-typed catalog item (itemType 'time'/'expense', not billable-sourced) is always
    // persisted with item_name = the literal "Manual" sentinel (manualInvoiceHelpers.js's own
    // documented data-loss quirk - the real catalog description is never written to the DB row).
    // Legacy's View Invoice never actually displays that stored value for these rows though - its
    // ITEM column is a live <select ng-model="item.expense"> whose shown label is re-resolved
    // from the current item-catalog list ({{expense.description}} ({{expense.type}})) - so
    // View Invoice's read-only table needs the same live resolution, not the raw "Manual" string.
    // Billable-sourced and 'other' (Case Referral Fee) rows already store their real display name
    // and are left as-is. Catalog only fetched when at least one row actually needs it.
    const needsCatalogResolution = (item) => item.itemType !== "other" && !isBillableSourced(item);
    const catalog = (plain.items || []).some(needsCatalogResolution) ? await getItemCatalog() : [];
    const catalogByKey = new Map(catalog.map((entry) => [`${entry.type}-${entry.code}`, entry]));

    const items = (plain.items || []).map((item) => {
      const catalogEntry = needsCatalogResolution(item)
        ? catalogByKey.get(`${item.itemType}-${item.expense}`)
        : null;
      return {
        ...item,
        // DECIMAL columns come back as zero-padded strings ("2.0000") - normalized the same way
        // legacy's own getInvoiceDetails success handler does (parseFloat before display).
        quantity: item.quantity === null ? null : Number(item.quantity),
        rate: item.rate === null ? null : Number(item.rate),
        // True for a real time_entry/expense_entry-sourced row (picked via Add Billable Activity)
        // - the View/Edit Invoice screens use this to lock quantity/rate/professional the same
        // way legacy's ng-disabled="disableEntity" does for item.billable==1 rows. Unrelated to
        // editability (see isEditable below) - both manual-catalog AND billable-sourced rows are
        // now fully re-savable, this only controls which fields render read-only.
        isBillable: isBillableSourced(item),
        itemName: catalogEntry ? `${catalogEntry.description} (${catalogEntry.type})` : item.itemName,
        professionalName: professionalById.get(item.professional) || roleById.get(item.professional) || null,
      };
    });
    // Editable when this is a manual (non-bulk) invoice and every item is something
    // ManualInvoiceForm can actually re-save correctly - see isReplaceableItem. No status check -
    // kept identical to updateManualInvoice's own eligibility check so a GET that says "editable"
    // can't have its PUT turn around and reject it.
    const isEditable = isManualInvoice(plain.bulkInvGrp) && items.every(isReplaceableItem);

    // Recomputed from the real invoice_items, not trusted from invoices.subtotal/inv_amt -
    // matches legacy's generateSummary() (View/PDF/Send/Resend all recompute this way; legacy
    // never displays those two stored columns directly). See sumItemTotals' own doc comment for
    // why: those columns can go stale relative to the real items with nothing to ever re-sync
    // them, so View/Edit both need to derive the total themselves rather than trust a column that
    // can silently drift. balance is deliberately left untouched here, matching legacy exactly -
    // generateSummary() only ever overwrites subtotal/inv_amt, never balance.
    const subtotal = sumItemTotals(items);
    const invAmt = roundMoney(subtotal - (Number(plain.discount) || 0));

    return res.status(200).json({
      success: true,
      data: {
        ...plain,
        agencyCode: plain.billableAgency?.agencyCode || null,
        billableAgency: undefined,
        billDateFrom: nullifyZeroDate(plain.billDateFrom),
        billDateTo: nullifyZeroDate(plain.billDateTo),
        items,
        isEditable,
        subtotal,
        invAmt,
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching invoice details:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoice details. Please try again.",
      data: null,
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > View Invoice screen: partial payment history.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { paymentList, paymentCount, totalPartialPayments }, status }
 */
export const getInvoicePaymentHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const payments = await InvoicePartialPayment.findAll({
      where: { invId: id },
      include: [
        { model: JudgeAssistantClerk, as: "creator", attributes: ["firstName", "lastName"], required: false },
      ],
      order: [["id", "ASC"]],
    });

    const data = payments.map((payment) => {
      const plain = payment.toJSON();
      return {
        ...plain,
        creatorFirstName: plain.creator?.firstName ?? null,
        creatorLastName: plain.creator?.lastName ?? null,
        creator: undefined,
      };
    });
    const totalPartialPayments = data.reduce((sum, payment) => sum + Number(payment.partialAmount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        paymentList: data,
        paymentCount: data.length,
        totalPartialPayments: roundMoney(totalPartialPayments),
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching invoice payment history:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch payment history. Please try again.",
      data: null,
      status: 500,
    });
  }
};
