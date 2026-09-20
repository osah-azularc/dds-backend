import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";
import {
  ADJUDICATION_LEGAL_LABEL,
  handleTimeItem,
  combineByProfessional,
  combineAdminFees,
} from "./invoicePdfTimeSections.js";
import { handleExpenseItem } from "./invoicePdfExpenseSections.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Buckets an invoice's line items into the PDF's real section structure - ported
 * from InvoicesController::generateSummary (~1905-2056) and its
 * getExpensesByUserAndType/getRoleDetails helpers (osah.repos). Confirmed gap,
 * closed 2026-08-19: invoicePdfTemplate.js previously rendered every item as a
 * single hardcoded "Case Referral Fee" row regardless of its real type - a
 * scoping leftover from when this app could only ever produce Case Referral Fee
 * items, which stopped being true once manual-catalog items and Add Billable
 * Activity picks became real.
 *
 * Legacy resolves this from one SQL join (invoice_items LEFT JOIN
 * judge_assistant_clerk/time_entry_tasks/time_entry_expense_types); this batches
 * the same three lookups (plus time_entry_billing_roles, for the one case where
 * the stored professional id is a Role, not an employee - AAA time items entered
 * through the Role select) instead of one row at a time.
 *
 * Bucketing rules (mirrors generateSummary's sequential if-blocks - conditions never overlap in
 * real data, since employee.userType/subTypeRole combinations are mutually exclusive across the
 * rules):
 * - 'other' itemCode 1, no matching employee -> Case Referral Fee
 * - 'time', employee.userType 'judge' + subTypeRole 'judge', task not AAA -> Adjudication
 * Fees "Legal" rollup (time_alj); task IS AAA -> Administrative Fees
 * - 'time', no matching employee, task IS AAA -> Administrative Fees (professional id is a
 * time_entry_billing_roles.id here, not an employee id - see getRoleDetails)
 * - 'time', employee.userType 'sa', task not AAA -> Adjudication Fees "Legal" rollup
 * (time_sa, label Staff Attorney or Law Clerk by subTypeRole); task IS AAA -> Admin. Fees
 * - 'time', employee.userType 'judge' + subTypeRole 'saalj', task not AAA -> Adjudication
 * Fees "Legal" rollup (time_saalj); task IS AAA -> Administrative Fees
 * - 'expense', employee.userType 'cma' / 'judge'+judge / 'judge'+saalj / 'sa' / 'sa'+law_clerk
 * -> grouped by (expense type name, professional) into Expenses - see groupExpenseItem's
 * own doc comment for the legacy quirk this reproduces (quantity/rate always blank there).
 * Items matching none of the above render nowhere in the itemized breakdown (matches legacy -
 * generateSummary has no fallback branch), though they still count toward the invoice's own
 * subtotal/total, which are computed independently (manualInvoiceHelpers.js's
 * computeInvoiceFinancials) and not derived from these buckets.
 *
 * The actual per-item bucketing logic (2026-08-27, split purely to stay under the 300-line file
 * guideline, no behavior change) lives in invoicePdfTimeSections.js (the 'time' item rules +
 * ADJUDICATION_LEGAL_LABEL) and invoicePdfExpenseSections.js (the 'expense' item rules) - this
 * file is now just the query batching + top-level per-item dispatch + final bucket
 * combine/shape.
 */

/**
 * @description (undocumented)
 * @param {*} items
 * @returns {*} { caseReferral, timeAlj, timeSa, timeSaalj, allAgenciesAdministrativeFee, expenseCma, expenseAlj, expenseSaalj, expenseSa, expenseLawclerk, summary: { administrativeFee, caseReferral, timeExpense: [{label, total}] } } - timeExpense is an array (not a Map) so invoicePdfTemplate.js/invoicePdf.ejs don't need to know about Map, insertion order preserved same as legacy's PHP associative array (case_referral's own 0-suppression quirk kept: "Legal" is the first key when present, matching generateSummary initializing it before the loop starts).
 */
export const buildInvoicePdfSections = async (items) => {
  const professionalIds = [...new Set(items.map((item) => item.professional).filter(Boolean))];
  const timeTaskIds = [
    ...new Set(
      items.filter((item) => item.itemType === "time" && item.taskId).map((item) => item.taskId),
    ),
  ];
  const expenseTaskIds = [
    ...new Set(
      items.filter((item) => item.itemType === "expense" && item.taskId).map((item) => item.taskId),
    ),
  ];

  const [employees, tasks, expenseTypes, roles] = await Promise.all([
    professionalIds.length
      ? JudgeAssistantClerk.findAll({
          where: { userId: professionalIds },
          attributes: ["userId", "firstName", "lastName", "userType", "subTypeRole"],
        })
      : Promise.resolve([]),
    timeTaskIds.length
      ? TimeEntryTask.findAll({
          where: { id: timeTaskIds },
          attributes: ["id", "taskName", "taskAbbreviation"],
        })
      : Promise.resolve([]),
    expenseTaskIds.length
      ? TimeEntryExpenseType.findAll({
          where: { id: expenseTaskIds },
          attributes: ["id", "expenseType"],
        })
      : Promise.resolve([]),
    // Only ever consulted for a 'time' item whose professional id didn't match a real employee
    // above (the AAA-Role-select case) - querying for every professional id up front is
    // harmless (most simply won't match a row here) and avoids a second, conditional round trip.
    professionalIds.length
      ? TimeEntryBillingRole.findAll({ where: { id: professionalIds }, attributes: ["id", "subTypeRole"] })
      : Promise.resolve([]),
  ]);

  const employeeById = new Map(employees.map((row) => [row.userId, row]));
  const taskById = new Map(tasks.map((row) => [row.id, row]));
  const expenseTypeById = new Map(expenseTypes.map((row) => [row.id, row]));
  const roleById = new Map(roles.map((row) => [row.id, row]));

  const buckets = {
    caseReferral: [],
    timeAlj: [],
    timeSa: [],
    timeSaalj: [],
    allAgenciesAdministrativeFee: [],
  };
  const expenseGroups = {
    expenseCma: new Map(),
    expenseAlj: new Map(),
    expenseSaalj: new Map(),
    expenseSa: new Map(),
    expenseLawclerk: new Map(),
  };
  // "Legal" pre-seeded at 0, same insertion position generateSummary's own $data['summary']
  // ['time_expense']['Legal'] = 0 gets before its loop starts - keeps it first when present,
  // regardless of whether Legal or expense-type items are encountered first below.
  const summary = {
    administrativeFee: 0,
    caseReferral: 0,
    timeExpense: new Map([[ADJUDICATION_LEGAL_LABEL, 0]]),
  };

  items.forEach((item) => {
    const employee = employeeById.get(item.professional);

    if (item.itemType === "other" && item.itemCode === 1 && !employee) {
      buckets.caseReferral.push(item);
      // BUG FIX 2026-09-03 (precision audit, live-verified): item.total is a Sequelize DECIMAL
      // column, returned as a STRING - `summary.caseReferral += item.total` was doing JS string
      // concatenation ("0" + "300.00" + "8.58" = "0300.008.58", not 300+8.58=308.58), which
      // Number() can't parse - the PDF's own SUMMARY page silently showed $0.00 for Case Referral
      // Fee on every real invoice with at least one such item, confirmed via a real generated PDF.
      summary.caseReferral += Number(item.total);
      return;
    }
    if (item.itemType === "time") {
      handleTimeItem(item, employee, { taskById, roleById, buckets, summary });
      return;
    }
    if (item.itemType === "expense") {
      handleExpenseItem(item, employee, { expenseTypeById, expenseGroups, summary });
    }
  });

  // Matches generateSummary's own cleanup: an empty "Legal" rollup (no ALJ/SA/SAALJ time items
  // actually contributed) is removed rather than rendered as a $0.00 row.
  if (summary.timeExpense.get(ADJUDICATION_LEGAL_LABEL) === 0) {
    summary.timeExpense.delete(ADJUDICATION_LEGAL_LABEL);
  }

  return {
    ...buckets,
    timeAlj: combineByProfessional(buckets.timeAlj),
    timeSa: combineByProfessional(buckets.timeSa),
    timeSaalj: combineByProfessional(buckets.timeSaalj),
    allAgenciesAdministrativeFee: combineAdminFees(buckets.allAgenciesAdministrativeFee),
    expenseCma: [...expenseGroups.expenseCma.values()],
    expenseAlj: [...expenseGroups.expenseAlj.values()],
    expenseSaalj: [...expenseGroups.expenseSaalj.values()],
    expenseSa: [...expenseGroups.expenseSa.values()],
    expenseLawclerk: [...expenseGroups.expenseLawclerk.values()],
    summary: {
      administrativeFee: summary.administrativeFee,
      caseReferral: summary.caseReferral,
      timeExpense: [...summary.timeExpense.entries()].map(([label, total]) => ({ label, total })),
    },
  };
};
