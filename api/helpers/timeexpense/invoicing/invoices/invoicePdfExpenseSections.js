/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * The 'expense' item half of buildInvoicePdfSections' bucketing (grouped by
 * expense type name + professional into the Expenses section) - see
 * invoicePdfSections.js's own doc comment for the full bucketing-rules table
 * this implements. Split out of that file (2026-08-27, alongside
 * invoicePdfTimeSections.js) purely to stay under the 300-line file guideline;
 * no behavior change.
 */

/**
 * @description
 * Groups one expense item into its role bucket by (expense type name,
 * professional) - matches legacy's getExpensesByUserAndType, including its real
 * quirk: the grouped record legacy builds has no quantity/rate key at all (only
 * professional/FirstName/LastName/task_name/user_type/total), so every grouped
 * expense row's QTY/RATE columns render blank in the PDF - only TOTAL is ever
 * real. That's not a rendering choice on legacy's part, it's what its own
 * missing-array-key fallback produces; reproduced here deliberately rather than
 * "fixed", consistent with every other legacy quirk preserved elsewhere in this
 * module (see manualInvoiceHelpers.js's item_name='Manual' sentinel for another
 * example of the same policy).
 */
// BUG FIX 2026-09-03 (precision audit, live-verified - see invoicePdfSections.js's own matching
// fix for the full trace): item.total is a Sequelize DECIMAL column, returned as a STRING - a
// bare `+= item.total` does JS string concatenation, not numeric addition. Number(item.total) at
// both the initial assignment (so a later merge starts from a real number) and the accumulation.
const groupExpenseItem = (map, item, expenseTypeName, label, employee) => {
  const key = `${expenseTypeName}_${item.professional}`;
  const existing = map.get(key);
  if (existing) {
    existing.total += Number(item.total);
    return;
  }
  map.set(key, {
    professional: item.professional,
    firstName: employee?.firstName || "",
    lastName: employee?.lastName || "",
    taskName: expenseTypeName || "",
    userTypeLabel: label,
    total: Number(item.total),
  });
};

/**
 * @description
 * Buckets one 'expense' item into its role-grouped Expenses destination - the 5
 * mutually-exclusive expense-item branches from invoicePdfSections.js's own
 * bucketing rules doc comment (CMA, ALJ, SAALJ, SA+Law Clerk, SA). Extracted
 * purely to keep buildInvoicePdfSections' own cognitive complexity down - no
 * behavior change.
 * @param {*} item
 * @param {*} employee
 * @param {*} context
 */
export const handleExpenseItem = (item, employee, { expenseTypeById, expenseGroups, summary }) => {
  const userType = employee?.userType;
  const subTypeRole = employee?.subTypeRole;
  const expenseType = expenseTypeById.get(item.taskId);
  const expenseTypeName = expenseType?.expenseType;

  const bumpExpenseSummary = () => {
    const label = expenseTypeName || "";
    // Same fix as groupExpenseItem above - item.total is a Sequelize DECIMAL string.
    summary.timeExpense.set(label, (summary.timeExpense.get(label) || 0) + Number(item.total));
  };

  if (userType === "cma") {
    groupExpenseItem(expenseGroups.expenseCma, item, expenseTypeName, "Admin. Personnel", employee);
    bumpExpenseSummary();
  } else if (userType === "judge" && subTypeRole === "judge") {
    groupExpenseItem(expenseGroups.expenseAlj, item, expenseTypeName, "Administrative Law Judge", employee);
    bumpExpenseSummary();
  } else if (userType === "judge" && subTypeRole === "saalj") {
    groupExpenseItem(
      expenseGroups.expenseSaalj,
      item,
      expenseTypeName,
      "Special Assistant Administrative Law Judge",
      employee,
    );
    bumpExpenseSummary();
  } else if (userType === "sa" && subTypeRole === "law_clerk") {
    groupExpenseItem(expenseGroups.expenseLawclerk, item, expenseTypeName, "Law Clerk", employee);
    bumpExpenseSummary();
  } else if (userType === "sa") {
    groupExpenseItem(expenseGroups.expenseSa, item, expenseTypeName, "Staff Attorney", employee);
    bumpExpenseSummary();
  }
};
