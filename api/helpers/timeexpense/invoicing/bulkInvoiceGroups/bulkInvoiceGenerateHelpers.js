import dayjs from "dayjs";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { buildRateBySubTypeRole } from "../billableActivity/billableActivityHelpers.js";
import { fetchTimeEntries, fetchExpenseEntries } from "../billableActivity/billableActivityFetchers.js";
import { computeLineTotal, roundMoney } from "../shared/computationHelpers.js";
import { buildInvoiceItemRows, buildBillableInvoiceItemRows } from "../shared/manualInvoiceHelpers.js";
import { linkBillableItemsToInvoice } from "../shared/billableLinkageHelpers.js";
import { buildAaaInvoiceItemRows } from "./bulkInvoiceGenerateAaaHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > Generate Invoices - per-agency data gathering + the
 * actual per-agency invoice-creation loop. Ported from
 * BulkinvoicesController::getAgencyTimeEntries/getAgencyExpenseEntries
 * (re-queried fresh at generate time, deliberately NOT reused from the group's
 * stored preview/summary - that data can be stale by the time Generate actually
 * runs, matching legacy's own real re-query rather than trusting cached amounts).
 *
 * Reuses billableActivityHelpers.js's fetchTimeEntries/fetchExpenseEntries (the
 * Add-Billable-Activity picker's own query) rather than writing a third, near-
 * identical query - same table joins, same billable/date-range filtering. The one
 * thing those return that a *display* list doesn't need but Generate does:
 * excluding rows already invoiced *for this specific agency* (picker rows show
 * already-added entries greyed out; Generate must never re-invoice them).
 *
 * The AAA role lookup + per-agency AAA invoice_items row building
 * (loadAaaLookups/buildAaaInvoiceItemRows) moved out (2026-08-27) to
 * bulkInvoiceGenerateAaaHelpers.js purely to stay under the 300-line file
 * guideline - no behavior change; this file imports buildAaaInvoiceItemRows
 * back from there, and re-exports loadAaaLookups so
 * bulkInvoiceGenerateController.js's own import doesn't need to know the
 * AAA-specific lookups moved to their own file at all.
 */

export { loadAaaLookups } from "./bulkInvoiceGenerateAaaHelpers.js";

/**
 * @description
 * This agency's not-yet-invoiced time_entry/expense_entry rows in the group's
 * billable-activity date range, shaped into the two forms manualInvoiceHelpers.js/
 * billableLinkageHelpers.js's already-proven functions need:
 * - items: [{ itemCode, itemType, billable: true }] - feeds
 * buildBillableInvoiceItemRows/linkBillableItemsToInvoice directly, same as a
 * manual invoice's own Add-Billable-Activity picks.
 * - resolvedDetails: Map keyed "time-<id>"/"expense-<id>" - same shape
 * resolveBillableItemDetails returns, built here directly from
 * fetchTimeEntries/fetchExpenseEntries's own row data instead (no need to
 * re-fetch by id list right after fetching by agency/date-range).
 * @param {*} agencyDescription
 * @param {*} agencyId
 * @param {*} billDateFrom
 * @param {*} billDateTo
 */
export const fetchAgencyBillableItems = async (agencyDescription, agencyId, billDateFrom, billDateTo) => {
  const rateBySubTypeRole = await buildRateBySubTypeRole();
  const [timeRows, expenseRows] = await Promise.all([
    fetchTimeEntries({
      from: billDateFrom,
      to: billDateTo,
      agencyDescription,
      employee: "",
      rateBySubTypeRole,
      offset: 0,
      limit: 100000,
      agencyId,
    }),
    fetchExpenseEntries({
      from: billDateFrom,
      to: billDateTo,
      agencyDescription,
      employee: "",
      offset: 0,
      limit: 100000,
      agencyId,
    }),
  ]);

  // Matches legacy's own per-agency exclusion (getAgencyTimeEntries/getAgencyExpenseEntries'
  // `NOT FIND_IN_SET(agency_id, added_for_agencies)`) - fetchTimeEntries/fetchExpenseEntries only
  // *sort* already-added rows last (for the picker's greyed-out display), they don't exclude them.
  const notYetInvoicedForAgency = (row) =>
    !String(row.addedForAgencies || "")
      .split(",")
      .filter(Boolean)
      .includes(String(agencyId));

  const items = [];
  const resolvedDetails = new Map();

  timeRows.filter(notYetInvoicedForAgency).forEach((row) => {
    items.push({ itemCode: row.id, itemType: "time", billable: true });
    const rate = Number(row.rate) || 0;
    resolvedDetails.set(`time-${row.id}`, {
      professional: row.professional,
      quantity: row.quantity,
      rate,
      itemName: row.taskName || "",
      taskId: row.taskId ?? row.id,
      total: computeLineTotal(row.quantity, rate),
      addedForAgencies: row.addedForAgencies || "",
    });
  });

  expenseRows.filter(notYetInvoicedForAgency).forEach((row) => {
    items.push({ itemCode: row.id, itemType: "expense", billable: true });
    const rate = Number(row.totalAmount) || 0;
    resolvedDetails.set(`expense-${row.id}`, {
      professional: row.professional,
      quantity: null,
      rate,
      itemName: row.expenseTypesNames || "",
      taskId: row.taskId,
      total: roundMoney(rate),
      addedForAgencies: row.addedForAgencies || "",
    });
  });

  return { items, resolvedDetails };
};

/**
 * @description
 * The actual per-agency invoice-creation loop, extracted so it can run either
 * against an already-saved group (bulkInvoiceGenerateController.js's own
 * generateBulkInvoices, unchanged) or as one step inside a single, larger
 * transaction that creates the group AND generates in the same request
 * (createAndGenerateBulkInvoices below) - matching legacy's own "Generate works
 * without an explicit Save first" UX, but atomically: unlike legacy's real,
 * confirmed defect (see the migration doc's checklist item 17/18 - a failed
 * generate-without-save can leave a real, permanently-dangling invoice with no
 * backing group row), a failure partway through this loop rolls back the entire
 * transaction, so nothing is left behind at all - no dangling group, no dangling
 * invoice.
 *
 * NOT idempotent (matches legacy - regenerating would double-invoice the same
 * billable activity); callers are responsible for their own invoiceTabStatus/
 * already-generated guard before calling this.
 * @param {Object} params - id (bulk_invoices.bulkInvoiceId - a real, already-persisted value by the time this runs either way). preview (a computeBulkInvoicePreview-shaped object - either freshly computed, or normalizeStoredSummaryPayload's own output). remitTemplate (InvoiceTemplate instance or null). aaaLookups (loadAaaLookups' own return value). userId. transaction (required - every write here must land in the caller's own transaction, never its own).
 * @returns {*} { masterTotal, agenciesCount }
 */
export const generateInvoicesForAgencies = async ({ id, preview, remitTemplate, aaaLookups, userId, transaction }) => {
  const agencies = Object.entries(preview.timeExpenseEntries || {});
  let masterTotal = 0;
  const now = new Date();
  const invoiceDate = dayjs().format("YYYY-MM-DD");
  const invDueDate = dayjs().add(30, "day").format("YYYY-MM-DD");

  // Sequential, not Promise.all - matches legacy's own per-agency sequential save (each
  // saveInvoice call re-reads MAX(id)+1 for numbering, same accepted non-atomic pattern
  // manualInvoiceHelpers.js's saveManualInvoice already uses; sequential awaits inside one
  // transaction is what lets each iteration's read see the previous iteration's own insert).
  for (const [, agency] of agencies) {
    const lastInvoice = await Invoice.findOne({ order: [["id", "DESC"]], transaction });
    const lastId = lastInvoice ? lastInvoice.id : 0;
    const invNo = `${dayjs().format("YYYY")}/${dayjs().format("MM")}-${String(lastId + 1).padStart(4, "0")}`;

    const subtotal = Number(agency.totalInvoiceAmount) || 0;
    const discount = Number(agency.discount) || 0;

    const invoice = await Invoice.create(
      {
        invNo,
        invDate: invoiceDate,
        billDateFrom: preview.billDateFrom || null,
        billDateTo: preview.billDateTo || null,
        billingPeriodDateFrom: preview.billingPeriodDateFrom || null,
        billingPeriodDateTo: preview.billingPeriodDateTo || null,
        agency: agency.agencyId,
        agencyName: agency.agency || "",
        agencyEmail: agency.agencyEmail || "",
        userId: agency.agencyId,
        bulkInvGrp: String(id),
        discount,
        discountDesc: "",
        memo: "",
        subtotal,
        invAmt: roundMoney(subtotal - discount),
        balance: roundMoney(subtotal - discount),
        dueDate: 30,
        remitInformation: remitTemplate?.remitInformation || "",
        address: "",
        taxInformation: remitTemplate?.tanInformation || "",
        status: 2,
        isDeleted: 0,
        actions: "2",
        invDueDate,
        createdDate: now,
        createdBy: userId,
        modifiedDate: now,
        modifiedBy: userId,
      },
      { transaction },
    );

    const itemRowArgs = { invId: invoice.id, invNo, createdBy: userId, now };

    // Case Referral Fee - direct reuse of buildInvoiceItemRows' "other" branch (identical shape
    // to a manual invoice's own Case Referral Fee row).
    const caseReferralItems = Number(agency.caseReferrals)
      ? buildInvoiceItemRows(
          [{ itemCode: 1, itemType: "other", billable: false, quantity: agency.caseReferrals, rate: preview.caseReferralFee }],
          itemRowArgs,
        )
      : [];

    const { rows: aaaItemRows } = buildAaaInvoiceItemRows(agency, preview.aaaEntries, aaaLookups, itemRowArgs);

    const { items: billableItems, resolvedDetails } = await fetchAgencyBillableItems(
      agency.agency,
      agency.agencyId,
      preview.billDateFrom,
      preview.billDateTo,
    );
    const billableItemRows = buildBillableInvoiceItemRows(billableItems, resolvedDetails, itemRowArgs);

    await InvoiceItem.bulkCreate([...caseReferralItems, ...aaaItemRows, ...billableItemRows], { transaction });

    await linkBillableItemsToInvoice(billableItems, {
      agencyId: agency.agencyId,
      invoiceId: invoice.id,
      invNo,
      transaction,
    });

    await InvLog.create(
      {
        invId: invoice.id,
        invNo,
        action: 2,
        description: "Invoice saved to draft",
        status: "1",
        createdAt: now,
        createdBy: userId,
      },
      { transaction },
    );

    masterTotal = roundMoney(masterTotal + subtotal);
  }

  return { masterTotal, agenciesCount: agencies.length };
};
