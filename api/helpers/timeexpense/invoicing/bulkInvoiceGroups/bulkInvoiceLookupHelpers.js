import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import { computeLineTotal, roundMoney } from "../shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Shared row-shaping/lookup utilities for the Bulk Invoice Groups > Create
 * preview computation (bulkInvoiceAaaHelpers.js / bulkInvoiceAgencyTimeHelpers.js
 * / bulkInvoiceExpenseHelpers.js) - split out purely to stay under the 300-line
 * file guideline, no behavior change. Ported from
 * BulkinvoicesController::getOnlyAAAEntries/getOnlyTimeEntries/
 * getOnlyExpenseEntries/getTimeEntryAgencyDetails.
 */

// split_time_btwn_agency comes back "HH:MM:SS" - matches legacy's
// ROUND(TIME_TO_SEC(split_time_btwn_agency)/3600, 2) SQL expression (computed once here, not
// the PrecisionHelper truncation used further downstream for percentages/allocations).
export const hoursFromSplitTime = (value) => {
  if (!value) return 0;
  const [h = 0, m = 0, s = 0] = String(value).split(":").map(Number);
  return roundMoney(h + m / 60 + s / 3600);
};

// "HH:MM:SS" -> whole seconds - matches legacy's $totalSeconds1 computation
// ($time1_exp[0]*3600 + $time1_exp[1]*60 + $time1_exp[2]).
export const secondsFromSplitTime = (value) => {
  const [h = 0, m = 0, s = 0] = String(value || "").split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

// Strips brackets/quotes from the bracketed/quoted CSV columns (agency_work_type,
// agency_work_type_code, agencies), matching legacy's repeated REPLACE(REPLACE(REPLACE(...)))
// SQL chains, then splits on `separator`. Quote-stripping runs unconditionally BEFORE the split,
// so `separator` must always be a plain "," (never '","' - by the time split() runs, every quote
// is already gone, so a quote-comma-quote separator can never match anything). Callers must
// therefore pass the RAW, un-REPLACE'd column value for agency_work_type - see
// bulkInvoiceAgencyTimeHelpers.js's own agencyWorkType attribute comment for the real bug this
// caused (2026-08-27) when a caller instead pre-stripped quotes at the SQL level.
export const csvList = (value, separator = ",") =>
  String(value || "")
    .replaceAll(/[[\]]/g, "")
    .replaceAll('"', "")
    .split(separator)
    .map((v) => v.trim())
    .filter((v) => v !== "");

// Resolves one time_entry/expense_entry row's list of agency descriptions - either via its
// `agencies` id-CSV (looked up per id, cached across rows in the caller-owned agencyDescCache
// Map) or, when that's empty, via agencyWorkType's own bracketed description list. Shared by
// bulkInvoiceAgencyTimeHelpers.js and bulkInvoiceExpenseHelpers.js, which both port this exact
// two-source resolution from their respective legacy getOnlyTimeEntries/getOnlyExpenseEntries -
// centralized here rather than duplicated in both, so it's fixed/adjusted in exactly one place.
export const resolveAgencyDescriptions = async (plain, agencyDescCache) => {
  if (!plain.agencies) {
    return csvList(plain.agencyWorkType, ",");
  }
  const agencyIds = csvList(plain.agencies, ",");
  const descriptions = [];
  for (const agencyId of agencyIds) {
    if (!agencyDescCache.has(agencyId)) {
      const agency = await BillableAgency.findOne({ where: { id: agencyId } });
      agencyDescCache.set(agencyId, agency?.agencyDescription || "");
    }
    descriptions.push(agencyDescCache.get(agencyId));
  }
  return descriptions;
};

// Two-step lookup matching getTimeEntryAgencyDetails($agency) - always by agency_description
// (never by id, even when the caller already resolved an id from the `agencies` CSV column -
// this double lookup is legacy's own real behavior, not a shortcut taken here).
export const agencyByDescription = async (description) =>
  BillableAgency.findOne({ where: { agencyDescription: description, isActive: "1" } });

// Ensures bucket[agencyDescription] exists, seeded once - matches the else-branch
// initialization inside getOnlyTimeEntries'/getOnlyExpenseEntries' nested loops.
export const ensureAgencyBucket = (bucket, agencyDescription) => {
  if (!bucket[agencyDescription]) {
    bucket[agencyDescription] = {
      agency: agencyDescription,
      totalNonAdminBillableHours: 0, // seconds, matches legacy's $totalSeconds1 accumulation
      agencyTimeBilledAmount: 0,
      agencyTime: 0, // hours
      expense: 0,
      agencyId: 0,
      agencyEmail: "",
      agencyCode: "",
      caseReferrals: 0,
      caseReferralAmount: 0,
      discount: 0,
      totalInvoiceAmount: 0,
      correction: 0,
    };
  }
  return bucket[agencyDescription];
};

// Case referral count/amount for one agency - 0 unless the caller passed real
// assignCaseReferralData (the Create form's own first preview call never does; the Assign Case
// Referrals modal's "Update" re-preview call does - see bulkInvoicePreviewHelpers.js's own doc
// comment).
export const caseReferralFor = (assignCaseReferralData, agencyId, caseReferralFee, fallback = 0) => {
  const assigned =
    assignCaseReferralData && Object.hasOwn(assignCaseReferralData, agencyId)
      ? assignCaseReferralData[agencyId]
      : fallback;
  const caseReferrals = assigned || 0;
  const caseReferralAmount = caseReferralFee > 0 && caseReferrals ? computeLineTotal(caseReferrals, caseReferralFee) : 0;
  return { caseReferrals, caseReferralAmount };
};
