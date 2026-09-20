/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail > Summary tab - normalizes a stored
 * bulk_invoice_summary.inv_summary_data payload into the shape
 * BulkInvoiceGroupSummary.jsx (and BulkInvoiceAdminFeeTable/
 * BulkInvoiceAgencySummaryTable) already render.
 *
 * CONFIRMED LIVE (2026-08-26, real bulk_invoice_summary rows): every one of this
 * database's 11 existing groups was created by *legacy* (Angular/PHP), whose own
 * json_encode($param) stores the payload in legacy's own snake_case shape
 * (bill_date_from, time_expense_entries[agency].agency_time, aaa_entries as an
 * object keyed by role, etc.) - a real, live-data-confirmed shape mismatch
 * against what this app's own createBulkInvoiceGroup stores (JSON.stringify of
 * the React frontend's camelCase preview object, echoed back verbatim - see that
 * controller's own comment). Both shapes exist in the same table today and both
 * have to render correctly - not a hypothetical edge case.
 *
 * One exception even within the legacy shape: `invoiceTabStatus` is stored
 * camelCase even there - it originated as a JS/Angular variable name
 * ($rootScope.invoiceTabStatus) that legacy's own PHP just copies through as-is
 * ($param['invoiceTabStatus'] = true in generateBulkInvoicesAction), so it never
 * had a snake_case form to begin with. Confirmed directly against a real stored
 * row, not assumed.
 *
 * FIXED (2026-08-26, live-verification finding): createBulkInvoiceGroup now
 * stores in this same legacy snake_case shape going forward (see
 * denormalizeToLegacyShape below) instead of echoing the frontend's own camelCase
 * payload verbatim - that verbatim-echo was two confirmed real bugs at once: (1)
 * the client's own stale, preview-time grp_id/grp_no (a non-atomic "guess" made
 * before the real row existed - see bulkInvoicePreviewHelpers.js's own
 * getNextBulkInvoiceId comment) got persisted and read back forever after,
 * showing the wrong group number on the Summary tab for every group this app
 * ever saves; (2) legacy's own PHP read path can't parse camelCase at all -
 * confirmed live, a real saved group's legacy view rendered as an entirely blank
 * page. Both fixed by writing the exact shape legacy itself always wrote, with
 * grp_id/grp_no now server-computed (the row's own real id/groupId) instead of
 * client-echoed.
 */
import { AAA_TYPE_LABELS } from "./bulkInvoiceAaaHelpers.js";

const AAA_LABEL_TO_CODE = new Map(Object.entries(AAA_TYPE_LABELS).map(([code, label]) => [label, code]));

const mapAaaEntry = (entry) => ({
  administrativeFeeType: entry.administrative_fee_type,
  totalHoursIncurred: entry.total_hours_incurred,
  hourlyRate: entry.hourly_rate,
  administrativeFeeAmount: entry.administrative_fee_amount,
});

const mapAgencyEntry = (entry) => ({
  agency: entry.agency,
  agencyId: entry.agency_id,
  agencyCode: entry.agency_code,
  agencyEmail: entry.agency_email,
  agencyTime: entry.agency_time,
  hourPercentages: entry.hour_percentages,
  agencyAaaAmount: entry.agency_aaa_amount,
  expense: entry.expense,
  caseReferrals: entry.case_referrals,
  caseReferralAmount: entry.case_referral_amount,
  correction: entry.correction,
  correctionType: entry.correction_type,
  discount: entry.discount,
  totalInvoiceAmount: entry.total_invoice_amount,
});

const mapInvoicesSummary = (summary = {}) => ({
  totalTime: summary.total_time,
  totalPercentage: summary.total_percentage,
  totalAdminAllocationFee: summary.total_admin_allocation_fee,
  expenseTotal: summary.expense_total,
  totalCaseReferrals: summary.total_case_referrals,
  totalCaseReferralFee: summary.total_case_referral_fee,
  totalInvoiceAmount: summary.total_invoice_amount,
  totalDiscount: summary.total_discount,
});

/**
 * @description
 * Converts a legacy (snake_case) stored preview payload into this app's own
 * camelCase preview shape. A payload created by this app's own Create flow
 * (already camelCase - detected by the absence of `bill_date_from`) is returned
 * unchanged.
 * @param {*} raw
 */
export const normalizeStoredSummaryPayload = (raw) => {
  if (!raw || !("bill_date_from" in raw)) {
    return raw;
  }

  const timeExpenseEntries = {};
  Object.entries(raw.time_expense_entries || {}).forEach(([agencyName, entry]) => {
    timeExpenseEntries[agencyName] = mapAgencyEntry(entry);
  });

  return {
    grpId: raw.grp_id,
    grpNo: raw.grp_no,
    billDateFrom: raw.bill_date_from,
    billDateTo: raw.bill_date_to,
    billingPeriodDateFrom: raw.billing_period_date_from,
    billingPeriodDateTo: raw.billing_period_date_to,
    cases: raw.cases,
    caseReferralFee: raw.case_referral_fee,
    selectedCases: raw.selectedCases,
    selectedCaseAmount: raw.selectedCaseAmount,
    totalCaseAmount: raw.totalCaseAmount,
    aaaEntries: Object.values(raw.aaa_entries || {}).map(mapAaaEntry),
    aaaTotalHours: raw.aaa_total_hours,
    aaaTotalAmount: raw.aaa_total_amount,
    allAaaEntries: raw.all_aaa_entries,
    timeExpenseEntries,
    invoicesSummary: mapInvoicesSummary(raw.invoices_summary),
    caseReferralData: raw.case_referral_data,
    adminCorrection: raw.adminCorrection,
    // Never snake_case to begin with - see module doc comment above.
    invoiceTabStatus: Boolean(raw.invoiceTabStatus),
    isSummaryExistInDb: raw.isSummaryExistInDb,
  };
};

const mapAaaEntryToLegacy = (entry) => ({
  administrative_fee_type: entry.administrativeFeeType,
  total_hours_incurred: entry.totalHoursIncurred,
  hourly_rate: entry.hourlyRate,
  administrative_fee_amount: entry.administrativeFeeAmount,
});

const mapAgencyEntryToLegacy = (entry) => ({
  agency: entry.agency,
  agency_id: entry.agencyId,
  agency_code: entry.agencyCode,
  agency_email: entry.agencyEmail,
  agency_time: entry.agencyTime,
  hour_percentages: entry.hourPercentages,
  agency_aaa_amount: entry.agencyAaaAmount,
  expense: entry.expense,
  case_referrals: entry.caseReferrals,
  case_referral_amount: entry.caseReferralAmount,
  correction: entry.correction,
  correction_type: entry.correctionType,
  discount: entry.discount,
  total_invoice_amount: entry.totalInvoiceAmount,
});

const mapInvoicesSummaryToLegacy = (summary = {}) => ({
  total_time: summary.totalTime,
  total_percentage: summary.totalPercentage,
  total_admin_allocation_fee: summary.totalAdminAllocationFee,
  expense_total: summary.expenseTotal,
  total_case_referrals: summary.totalCaseReferrals,
  total_case_referral_fee: summary.totalCaseReferralFee,
  total_invoice_amount: summary.totalInvoiceAmount,
  total_discount: summary.totalDiscount,
});

/**
 * @description
 * Inverse of normalizeStoredSummaryPayload - converts this app's own camelCase
 * preview shape (computeBulkInvoicePreview's response) into legacy's exact
 * snake_case shape for storage, so a future read (by either this app or legacy
 * itself) round-trips correctly. Used by createBulkInvoiceGroup (Save as Draft)
 * - see this file's own module doc comment for why storing the frontend's raw
 * camelCase shape verbatim was two confirmed real bugs at once.
 * @param {*} preview
 * @param {*} params
 * @param {*} groupNo }
 * @returns {*} A plain object ready for JSON.stringify - matches what legacy's own json_encode($param) produces, field-for-field, for every field normalizeStoredSummaryPayload reads back.
 */
export const denormalizeToLegacyShape = (preview, { groupId, groupNo }) => {
  const aaaEntriesByRole = {};
  (preview.aaaEntries || []).forEach((entry) => {
    const code = AAA_LABEL_TO_CODE.get(entry.administrativeFeeType) || entry.administrativeFeeType;
    aaaEntriesByRole[code] = mapAaaEntryToLegacy(entry);
  });

  const timeExpenseEntries = {};
  Object.entries(preview.timeExpenseEntries || {}).forEach(([agencyName, entry]) => {
    timeExpenseEntries[agencyName] = mapAgencyEntryToLegacy(entry);
  });

  return {
    grp_id: groupId,
    grp_no: groupNo,
    bill_date_from: preview.billDateFrom,
    bill_date_to: preview.billDateTo,
    billing_period_date_from: preview.billingPeriodDateFrom,
    billing_period_date_to: preview.billingPeriodDateTo,
    cases: preview.cases,
    case_referral_fee: preview.caseReferralFee,
    // Never snake_case in legacy either - see this file's own module doc comment.
    selectedCases: preview.selectedCases,
    selectedCaseAmount: preview.selectedCaseAmount,
    totalCaseAmount: preview.totalCaseAmount,
    aaa_entries: aaaEntriesByRole,
    aaa_total_hours: preview.aaaTotalHours,
    aaa_total_amount: preview.aaaTotalAmount,
    all_aaa_entries: preview.allAaaEntries,
    time_expense_entries: timeExpenseEntries,
    invoices_summary: mapInvoicesSummaryToLegacy(preview.invoicesSummary),
    case_referral_data: preview.caseReferralData,
    adminCorrection: preview.adminCorrection || 0,
    invoiceTabStatus: Boolean(preview.invoiceTabStatus),
    isSummaryExistInDb: preview.isSummaryExistInDb || 0,
  };
};
