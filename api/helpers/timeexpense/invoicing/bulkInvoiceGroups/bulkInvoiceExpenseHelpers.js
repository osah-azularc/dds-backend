import { Op } from "sequelize";
import ExpenseEntry from "../../../../models/timeexpense/timeentry/ExpenseEntry.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import { roundMoney } from "../shared/computationHelpers.js";
import {
  csvList,
  agencyByDescription,
  ensureAgencyBucket,
  caseReferralFor,
  resolveAgencyDescriptions,
} from "./bulkInvoiceLookupHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups > Create preview - non-AAA billable expense entries, merged
 * into the same per-agency bucket bulkInvoiceAgencyTimeHelpers.js's
 * buildAgencyTimeEntries built. Ported from
 * BulkinvoicesController::getOnlyExpenseEntries.
 */

/**
 * @description
 * Merges one expense-entry row's amount into every agency bucket it resolves
 * to, skipping an agency description that can't be resolved at all or that this
 * entry was already invoiced for (added_for_agencies). Extracted purely to keep
 * mergeExpenseEntries' own cognitive complexity down - no behavior change.
 * @param {*} rowData
 * @param {*} bucket
 */
const applyRowToAgencyBuckets = async (rowData, bucket) => {
  const { agencyDescriptions, addedForAgencyIds, eachAgencyAmount, assignCaseReferralData, caseReferralFee } =
    rowData;

  for (const agencyDescription of agencyDescriptions) {
    const agencyInfo = await agencyByDescription(agencyDescription);
    if (!agencyInfo || addedForAgencyIds.includes(String(agencyInfo.id))) continue;

    const entry = ensureAgencyBucket(bucket, agencyDescription);
    entry.expense = roundMoney(entry.expense + eachAgencyAmount);
    entry.agencyId = agencyInfo.id;
    entry.agencyEmail = agencyInfo.email || "";
    entry.agencyCode = agencyInfo.agencyCode || "";
    Object.assign(
      entry,
      caseReferralFor(assignCaseReferralData, agencyInfo.id, caseReferralFee, entry.caseReferrals),
    );
  }
};

/**
 * @description
 * Pulls every billable, posted-but-not-fully-invoiced (is_posted IN 1,3 -
 * excludes 2 = already fully invoiced to every agency it's split to) expense
 * entry in the date range and merges it into `bucket` (an agency with only
 * expenses, no time entries, gets its own fresh bucket here). Mutates `bucket` in
 * place; also computes each agency's total_invoice_amount = agency_aaa_amount +
 * agency_time_billed_amount + expense + case_referral_amount (discount/correction
 * stay 0 here - both are Summary-screen-only fields, out of scope for this
 * preview) and the invoice-totals summary. Mirrors getOnlyExpenseEntries exactly.
 * @param {*} bucket
 * @param {*} billDateFrom
 * @param {*} billDateTo
 * @param {*} assignCaseReferralData
 * @param {*} caseReferralFee
 */
export const mergeExpenseEntries = async (bucket, billDateFrom, billDateTo, assignCaseReferralData, caseReferralFee) => {
  const rows = await ExpenseEntry.findAll({
    attributes: ["id", "agencies", "roundedAmount", "addedForAgencies", "agencyWorkType"],
    include: [
      {
        model: TimeEntryExpenseType,
        as: "expenseTypeDetail",
        attributes: [],
        where: { isBillable: "1", isActive: "1" },
        required: true,
      },
    ],
    where: {
      isDeleted: "0",
      isPosted: { [Op.in]: ["1", "3"] },
      dateIncurred: { [Op.between]: [billDateFrom, billDateTo] },
    },
  });

  const agencyDescCache = new Map();

  for (const row of rows) {
    const plain = row.toJSON();
    const eachAgencyAmount = Number(plain.roundedAmount) || 0;
    const agencyDescriptions = await resolveAgencyDescriptions(plain, agencyDescCache);
    const addedForAgencyIds = csvList(plain.addedForAgencies, ",");

    await applyRowToAgencyBuckets(
      { agencyDescriptions, addedForAgencyIds, eachAgencyAmount, assignCaseReferralData, caseReferralFee },
      bucket,
    );
  }

  let expenseTotal = 0;
  let totalInvoiceAmount = 0;
  let totalCaseReferrals = 0;
  let totalCaseReferralFee = 0;

  await Promise.all(
    Object.entries(bucket).map(async ([agencyDescription, entry]) => {
      if (!Object.hasOwn(entry, "hourPercentages")) {
        entry.hourPercentages = "0.0000";
        entry.agencyAaaAmount = "0.00";
      }
      expenseTotal = roundMoney(expenseTotal + entry.expense);
      entry.totalInvoiceAmount = roundMoney(
        Number(entry.agencyAaaAmount || 0) + entry.agencyTimeBilledAmount + entry.expense + entry.caseReferralAmount,
      );
      totalInvoiceAmount = roundMoney(totalInvoiceAmount + entry.totalInvoiceAmount);
      totalCaseReferrals += Number(entry.caseReferrals) || 0;
      totalCaseReferralFee = roundMoney(totalCaseReferralFee + (Number(entry.caseReferralAmount) || 0));

      // Secondary/tertiary agency email concatenation - matches getOnlyExpenseEntries' closing loop.
      const agencyInfo = await agencyByDescription(agencyDescription);
      const extraEmails = [agencyInfo?.emailTwo, agencyInfo?.emailThree].filter(Boolean);
      if (extraEmails.length) entry.agencyEmail = [entry.agencyEmail, ...extraEmails].filter(Boolean).join(",");
    }),
  );

  return { expenseTotal, totalInvoiceAmount, totalCaseReferrals, totalCaseReferralFee };
};
