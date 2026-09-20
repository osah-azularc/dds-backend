import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import { fetchAaaEntries } from "./bulkInvoiceAaaHelpers.js";
import { buildAgencyTimeEntries, applyAgencyPercentagesAndAllocation } from "./bulkInvoiceAgencyTimeHelpers.js";
import { mergeExpenseEntries } from "./bulkInvoiceExpenseHelpers.js";
import { computeLineTotal } from "../shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Time & Expense > Invoicing > Bulk Invoice Groups > Create Bulk Invoice - top-
 * level orchestration for the preview computation, ported from
 * BulkinvoicesController::getBillableAgenciesByTimeEntriesAction. Pure
 * computation - reads time_entry/expense_entry, writes nothing (see
 * bulkInvoiceController.js's previewBulkInvoiceGroup for why: legacy's own
 * version never persists here either, only on Save/Generate from the Summary
 * screen). The 3-branch aggregation itself (AAA pool / non-AAA time / expense)
 * lives in the 3 sibling *Helpers files this orchestrates, each ported from one
 * of getOnlyAAAEntries/getOnlyTimeEntries/getOnlyExpenseEntries - split out
 * purely to stay under the 300-line file guideline.
 *
 * Case referral assignment (Assign Case Referrals modal) is implemented -
 * assignCaseReferralData arrives real (not {}) whenever this is called from
 * AssignCaseReferralsDialog.jsx's own "Update" (via useAssignCaseReferrals.js),
 * which re-calls this same preview endpoint after the Create form's own first
 * call (which still sends {}, since referrals aren't assigned until the Summary
 * screen). See bulkInvoiceCreateController.js's own param doc.
 */

// MAX(id)+1, non-atomic (no lock) - matches getLastBulkInvoiceId exactly, including its own
// race condition (two concurrent Create requests can compute the same "next" number). This is a
// preview-only display number; the real, collision-safe id only gets assigned when the group is
// actually saved (bulkInvoiceController.js's createBulkInvoiceGroup relies on bulk_invoices.id's
// own AUTO_INCREMENT instead of this precomputed value).
const getNextBulkInvoiceId = async () => {
  const last = await BulkInvoice.findOne({ order: [["id", "DESC"]] });
  return (last?.id || 0) + 1;
};

/**
 * @description
 * Full Create Bulk Invoice preview - AAA admin-fee pool, per-agency time+expense
 * aggregation, hour-percentage/AAA-allocation, and the invoice-totals summary.
 * Read-only. Response shape matches legacy's getBillableAgenciesByTimeEntriesAction
 * JSON field-for-field (camelCased), so bulkInvoicescontroller.js's own
 * $rootScope.bulkInvoiceData assignment logic can be used directly as the
 * reference for what the Summary screen (a later pass) needs to render from it.
 * @param {Object} params
 */
export const computeBulkInvoicePreview = async ({
  billDateFrom,
  billDateTo,
  caseReferralNo,
  caseReferralFee,
  assignCaseReferralData = {},
}) => {
  const [aaa, { bucket, totalTime }, grpId] = await Promise.all([
    fetchAaaEntries(billDateFrom, billDateTo),
    buildAgencyTimeEntries(billDateFrom, billDateTo, assignCaseReferralData, caseReferralFee),
    getNextBulkInvoiceId(),
  ]);

  // Computed from the time-entry pass only, BEFORE expense entries are merged in below - matches
  // legacy exactly: getOnlyTimeEntries computes+returns total_percentage/total_admin_allocation_fee
  // on its own, and getOnlyExpenseEntries (called afterward, in a separate step) never revisits
  // them. A real legacy quirk, not something to "fix" here: an agency with only expenses (no time
  // entries) gets its own hourPercentages/agencyAaaAmount defaulted to 0 by mergeExpenseEntries
  // below, but that 0 is never folded into these two totals - its row shows 0.0000%/$0.00 while
  // the header total stays exactly what the time-entry-only agencies alone summed to.
  const { totalPercentage, totalAdminAllocationFee } = applyAgencyPercentagesAndAllocation(
    bucket,
    totalTime,
    aaa.totalAmount,
  );

  const { expenseTotal, totalInvoiceAmount, totalCaseReferrals, totalCaseReferralFee } = await mergeExpenseEntries(
    bucket,
    billDateFrom,
    billDateTo,
    assignCaseReferralData,
    caseReferralFee,
  );

  return {
    grpId,
    grpNo: `B${String(grpId).padStart(5, "0")}`,
    aaaEntries: Object.values(aaa.byRole),
    aaaTotalHours: aaa.totalHours,
    aaaTotalAmount: aaa.totalAmount,
    allAaaEntries: aaa.allAaaEntries,
    timeExpenseEntries: bucket,
    caseReferralData: assignCaseReferralData,
    invoicesSummary: {
      totalTime,
      totalPercentage,
      totalAdminAllocationFee,
      expenseTotal,
      totalCaseReferrals,
      totalCaseReferralFee,
      totalInvoiceAmount,
    },
    billDateFrom,
    billDateTo,
    cases: Number(caseReferralNo) || 0,
    caseReferralFee: Number(caseReferralFee) || 0,
    // BulkInvoiceGroupSummary.jsx's own "Assigned Case Referrals" banner - matches legacy's
    // bulkInvoiceData.totalCaseAmount/selectedCases/selectedCaseAmount exactly. totalCaseAmount is
    // the full dollar value at stake (cases * fee, always populated); selectedCases/
    // selectedCaseAmount are the *actual* sum already assigned across every agency - identical to
    // invoicesSummary.totalCaseReferrals/totalCaseReferralFee above (legacy duplicates these two
    // values onto bulkInvoiceData for the banner's own convenience too, not a second computation).
    // Confirmed missing via live testing (2026-08-26) - the banner silently showed $0.00/$0.00
    // even after a real, successful Assign Case Referrals update.
    totalCaseAmount: computeLineTotal(Number(caseReferralNo) || 0, Number(caseReferralFee) || 0),
    selectedCases: totalCaseReferrals,
    selectedCaseAmount: totalCaseReferralFee,
  };
};
