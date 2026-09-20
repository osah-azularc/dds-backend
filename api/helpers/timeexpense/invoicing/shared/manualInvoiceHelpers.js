import dayjs from "dayjs";
import { roundMoney, computeLineTotal, sumLineItems } from "./computationHelpers.js";
import { resolveBillableItemDetails } from "./billableLinkageHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Shared field-computation logic between manualInvoiceController's
 * saveManualInvoice/updateManualInvoice (and the eligibility check in
 * getInvoiceDetails), extracted so both save paths stay in sync.
 */

// Item code -> display name for manual "other" line items (Case Referral Fee is the only
// reachable one - id 2 "All Agencies - Administrative" is commented out in legacy's own
// template). Used both to build InvoiceItem rows and to check an existing invoice's editability.
export const ITEM_NAME_BY_CODE = { 1: "Case Referral Fee" };

// Sentinel legacy uses in place of a real judge_assistant_clerk.user_id for manual "other" line
// items - they have no Professional field at all (invoicescontroller.js::checkAllLineItems).
export const MANUAL_ITEM_PROFESSIONAL = 9999;

// invoices.bulk_inv_grp marks a non-bulk (manual) invoice as "-" going forward, but real data
// has plenty of older rows stored as "" instead - both mean "not bulk-linked".
export const isManualInvoice = (bulkInvGrp) => !bulkInvGrp || bulkInvGrp === "-";

/**
 * @description
 * True for an InvoiceItem row this form can safely re-save on Edit - a Case
 * Referral Fee row (itemType 'other', a code its own dropdown recognizes), a
 * manual catalog row (itemType 'time'/'expense', typed-in quantity/rate), or a
 * billable-activity-sourced row (itemType 'time'/'expense', picked via Add
 * Billable Activity) - see isBillableSourced for how the latter two are told
 * apart. Now that both manual-catalog AND billable-sourced rows have real save/
 * edit support, any 'time'/'expense' row is replaceable; only an 'other' row
 * with an unrecognized code (data this form's own dropdown could never have
 * produced) is not.
 * Used identically by getInvoiceDetails's isEditable (invoiceDetailController.js)
 * and updateManualInvoice's own eligibility check (manualInvoiceController.js) -
 * kept as one function specifically so a GET that says "editable" can't have its
 * PUT turn around and reject it.
 * @param {*} item
 */
export const isReplaceableItem = (item) =>
  item.itemType === "other" ? Boolean(ITEM_NAME_BY_CODE[item.expense]) : true;

/**
 * @description
 * True for a 'time'/'expense' InvoiceItem row that came from the Add Billable
 * Activity picker (a real time_entry/expense_entry row) rather than being typed
 * in manually against the item catalog. item_name is the discriminator: manual
 * catalog rows are always saved with the literal string "Manual"
 * (buildInvoiceItemRows), billable-sourced rows are saved with the entry's own
 * real task_name/expense_types_names (buildBillableInvoiceItemRows) - matching
 * legacy's own "item_name != 'Manual'" definition of "real billable" used
 * throughout InvoicesController.php. The View/Edit Invoice screens use this to
 * lock quantity/rate/professional for these rows the same way legacy's
 * ng-disabled="disableEntity" does for item.billable==1 rows.
 * @param {*} item
 */
export const isBillableSourced = (item) => item.itemType !== "other" && item.itemName !== "Manual";

/**
 * @description
 * Validates billDateFrom/billDateTo ordering (both optional - only checked when
 * both are present).
 * @param {*} billDateFrom
 * @param {*} billDateTo
 * @returns {*} Error message string, or null when valid.
 */
export const validateBillingPeriod = (billDateFrom, billDateTo) => {
  if (billDateFrom && billDateTo && dayjs(billDateFrom).isAfter(dayjs(billDateTo))) {
    return "Invalid Billing Period date range";
  }
  return null;
};

// MySQL zero-date ('0000-00-00') means "no date", but Sequelize's DATEONLY type passes it
// through as-is instead of null - dayjs then leniently mis-parses it as 11/30/1899 on Edit/View
// Invoice, and re-saving it untouched fails dateStringDashboardSchema's format check. Normalize
// to null so it behaves like a real NULL column.
export const nullifyZeroDate = (value) => (value === "0000-00-00" ? null : value);

/**
 * @description
 * Server-computed, not trusted from the client - legacy's saveInvoiceAction
 * trusts invoiceData.subTotal/total exactly as submitted by the browser;
 * recomputing from the actual line items closes that gap. Manual items sum via
 * sumLineItems - each item's own ROUNDED total (computeLineTotal per item), not
 * raw quantity*rate - so `subtotal` always equals the real sum of this
 * invoice's own stored invoice_items.total rows (BUG FIX 2026-09-03, precision
 * audit: real legacy does NOT guarantee this - its own client-computed
 * invoices.subtotal and server-recomputed invoice_items.total come from two
 * independent formulas that can genuinely disagree by a cent; explicit product
 * decision to keep this app self-consistent instead of reproducing that
 * legacy quirk). Billable items use their resolved `total` directly
 * (resolveBillableItemDetails) rather than the client's quantity/rate - the
 * client isn't trusted for these at all, and an expense billable item has no
 * meaningful quantity to multiply by in the first place (its total is just its
 * own rounded_amount).
 * Parameters: resolvedBillableDetails - optional, only needed when `items` contains any billable:true rows (see resolveBillableItemDetails's Map shape).
 * @returns {*} { subtotal, total } on success, or { error } when discount exceeds subtotal.
 */
export const computeInvoiceFinancials = (items, discount, resolvedBillableDetails = new Map()) => {
  const manualSubtotal = sumLineItems(items.filter((item) => !item.billable));
  const billableSubtotal = items
    .filter((item) => item.billable)
    .reduce(
      (sum, item) => sum + (resolvedBillableDetails.get(`${item.itemType}-${item.itemCode}`)?.total || 0),
      0,
    );
  // roundMoney here too, not just on the final total - manualSubtotal/billableSubtotal are each
  // already sums of rounded per-item totals, but summing several of them can still pick up tiny
  // float-addition drift (the classic 0.1+0.2 class of error) - rounding once more keeps
  // `subtotal` itself exactly equal to SUM(invoice_items.total), not just close to it.
  const subtotal = roundMoney(manualSubtotal + billableSubtotal);
  if (discount > subtotal) {
    return { error: "Discount Amount cannot be greater than Sub Total Amount" };
  }
  return { subtotal, total: roundMoney(subtotal - discount) };
};

/**
 * @description
 * A newly-created draft can land straight in Overdue if its computed due date is
 * already in the past - matches legacy's saveInvoiceAction, which has an
 * unconditional `if($dueDate < date('Y-m-d')) { $invoiceStatus = 4; }` after the
 * send-vs-draft status is chosen (so it applies on both a plain "Save Draft" and
 * a "Send Invoice" click from Create).
 *
 * BUG FIX 2026-08-28 (parity audit): does NOT apply on Edit - updateInvoiceAction
 * (InvoicesController.php ~2619-3023) has no due-date comparison anywhere in it,
 * unlike a prior version of this comment claimed. Editing an already-past-due
 * invoice and clicking Save Draft used to wrongly force status to Overdue(4)
 * instead of leaving it Draft(2); now gated to the create path (currentStatus
 * === null) only.
 *
 * currentStatus (Edit only - omitted/null on a brand new invoice, where there's
 * nothing to preserve) reproduces updateInvoiceAction's real branching, traced in
 * full: editinvoice.phtml's form has no resend_inv hidden field at all (unlike
 * viewInvoice.phtml, which hardcodes it to 1) - so from the Edit Invoice screen,
 * `resend_inv` is always falsy, meaning only two of updateInvoiceAction's status
 * branches are ever actually reachable from this screen:
 * - Save Draft (sendInvoiceStatus false): status unconditionally resets to 2
 * (Draft) *regardless of the invoice's current status* - editing a Paid
 * invoice and clicking Save Draft really does put it back in Draft in legacy,
 * confirmed from source, not a guess.
 * - Send Invoice (sendInvoiceStatus true): status becomes 5 (Unpaid) only if it
 * was 2 (Draft) before; any other current status (Paid/Overdue/Partial/
 * Written off) is left as-is, matching legacy's `if ($status == 2) $status =
 * 5;` having no else branch.
 * @param {*} invoiceDate
 * @param {*} days
 * @param {*} sendInvoiceStatus
 * @param {*} currentStatus
 * @returns {*} { invDueDate, status } - status is the invoices.status code: 2 Draft, 5 Unpaid (sent, not yet due), or 4 Overdue (Create only, due date already passed).
 */
export const computeDueDateAndStatus = (
  invoiceDate,
  days,
  sendInvoiceStatus = false,
  currentStatus = null,
) => {
  const invDueDate = dayjs(invoiceDate).add(Number(days), "day").format("YYYY-MM-DD");
  const isCreate = currentStatus === null;

  let baseStatus;
  if (isCreate) {
    // Create (saveManualInvoice) - no prior status to preserve.
    baseStatus = sendInvoiceStatus ? 5 : 2;
  } else if (sendInvoiceStatus) {
    baseStatus = currentStatus === 2 ? 5 : currentStatus;
  } else {
    baseStatus = 2;
  }

  // Overdue-date override only exists in legacy's saveInvoiceAction (Create) - see this
  // function's own doc comment for the 2026-08-28 fix that scoped this to isCreate.
  const status = isCreate && invDueDate < dayjs().format("YYYY-MM-DD") ? 4 : baseStatus;
  return { invDueDate, status };
};

/**
 * @description
 * Builds InvoiceItem.bulkCreate rows for the two *manual* (typed-in quantity/
 * rate) shapes - billable-activity-sourced rows go through
 * buildBillableInvoiceItemRows instead, using server-resolved data rather than
 * anything the client typed:
 * - itemType 'other' (Case Referral Fee): item_name resolved from the fixed
 * ITEM_NAME_BY_CODE map, professional forced to the 9999 sentinel (matches
 * legacy's checkAllLineItems - this item type has no Professional field).
 * - itemType 'time'/'expense' (a catalog task/expense-type, picked from
 * itemCatalogHelpers.js's getItemCatalog): item_name is hardcoded to the
 * literal string "Manual" - InvoicesController::saveInvoiceAction's own
 * else-branch does the same (`$item_name = 'Manual'`) for any non-billable
 * 'time'/'expense' row, regardless of which catalog entry was actually
 * picked. That's a real legacy data-loss quirk (the chosen task/expense
 * type's real name isn't persisted, only its id via expense/taskId) - kept
 * as-is for parity rather than "fixed", since isBillableSourced depends on
 * recognizing this exact "Manual" sentinel to tell a re-editable manual row
 * apart from a real billable-activity-sourced one.
 * @param {*} items
 * @param {*} params
 * @param {*} invNo
 * @param {*} createdBy
 * @param {*} now }
 */
export const buildInvoiceItemRows = (items, { invId, invNo, createdBy, now }) =>
  items
    .filter((item) => !item.billable)
    .map((item) => {
      const isOther = item.itemType === "other";
      return {
        invId,
        invNo,
        expense: item.itemCode,
        itemType: item.itemType,
        itemName: isOther ? ITEM_NAME_BY_CODE[item.itemCode] || "other" : "Manual",
        taskId: item.itemCode,
        professional: isOther ? MANUAL_ITEM_PROFESSIONAL : item.professional,
        quantity: item.quantity,
        rate: item.rate,
        unit: "per hr/item",
        total: computeLineTotal(item.quantity, item.rate),
        isDeleted: 0,
        createdBy,
        createdAt: now,
      };
    });

/**
 * @description
 * Builds InvoiceItem.bulkCreate rows for billable-activity-sourced items (picked
 * via Add Billable Activity) - unlike buildInvoiceItemRows, every field of
 * substance (professional, quantity, rate, item_name, task_id) comes from
 * `resolvedDetails` (billableLinkageHelpers.js's resolveBillableItemDetails),
 * not from the client payload - the client only ever identifies *which* entry
 * was picked (itemCode/itemType), never what it's worth.
 * @param {*} items
 * @param {*} resolvedDetails
 * @param {*} params
 * @param {*} invNo
 * @param {*} createdBy
 * @param {*} now }
 * @returns {*} InvoiceItem rows, or throws if any billable item has no matching resolved entry (caller should have already validated this before starting the write).
 */
export const buildBillableInvoiceItemRows = (items, resolvedDetails, { invId, invNo, createdBy, now }) =>
  items
    .filter((item) => item.billable)
    .map((item) => {
      const details = resolvedDetails.get(`${item.itemType}-${item.itemCode}`);
      if (!details) {
        throw new Error(`Billable ${item.itemType} entry ${item.itemCode} was not found`);
      }
      return {
        invId,
        invNo,
        expense: item.itemCode,
        itemType: item.itemType,
        itemName: details.itemName,
        taskId: details.taskId,
        professional: details.professional,
        quantity: details.quantity,
        rate: details.rate,
        unit: "per hr/item",
        total: details.total,
        isDeleted: 0,
        createdBy,
        createdAt: now,
      };
    });

/**
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Shared by saveManualInvoice/updateManualInvoice (manualInvoiceSaveController.js /
 * manualInvoiceUpdateController.js) - resolves every billable item in the
 * submitted payload against its source time_entry/expense_entry row, and
 * validates the ones in `itemsToValidate` aren't already linked to a *different*
 * invoice for this agency. `itemsToValidate` is deliberately a subset of
 * `allBillableItems` on Edit - an item already part of *this* invoice legitimately
 * has this agency in its own addedForAgencies already (from its original save),
 * so re-validating unchanged kept items against themselves would always
 * (wrongly) fail; only genuinely new picks need the check. Moved here from
 * manualInvoiceController.js (2026-08-27) purely to keep the two callers' own
 * files under the 300-line guideline once they were split apart - no behavior
 * change.
 * @param {*} allBillableItems
 * @param {*} itemsToValidate
 * @param {*} agencyId
 * @returns {*} { resolvedDetails, error } - error is a user-facing message, or null when every item resolved and no genuinely-new pick collides with an existing link.
 */
export const resolveAndValidateBillableItems = async (allBillableItems, itemsToValidate, agencyId) => {
  const resolvedDetails = await resolveBillableItemDetails(allBillableItems);

  const unresolved = allBillableItems.some(
    (item) => !resolvedDetails.has(`${item.itemType}-${item.itemCode}`),
  );
  if (unresolved) {
    return {
      resolvedDetails,
      error: "One or more billable activity items are no longer available.",
    };
  }

  const alreadyAdded = itemsToValidate.some((item) =>
    resolvedDetails
      .get(`${item.itemType}-${item.itemCode}`)
      .addedForAgencies.includes(String(agencyId)),
  );
  if (alreadyAdded) {
    return {
      resolvedDetails,
      error:
        "One or more selected billable activity items have already been added to an invoice for this agency.",
    };
  }

  return { resolvedDetails, error: null };
};
