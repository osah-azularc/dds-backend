import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-18
 * @description
 * Backs the manual invoice Item dropdown's non-"Case Referral Fee" options -
 * ported from InvoicesController::getTimeExpenseListAction
 * (osah.repos/module/Osahform), which is what the same per-row <select>
 * invoicescontroller.js's checkAllLineItems binds to (ng-repeat="expense in
 * getTimeExpenseBillable" in createinvoicemanual.phtml/editinvoice.phtml) -
 * NOT the separate "Add Billable Activity" flow (getDateWiseBillableItems,
 * see billableActivityHelpers.js/billableLinkageHelpers.js), which imports
 * real, already-logged time_entry/expense_entry rows. This is legacy's *other*
 * item source: any active row from the task/expense-type master catalog, typed
 * in manually (own quantity/rate/professional) exactly like Case Referral Fee -
 * originally missed in this port's Phase 1 scoping, corrected 2026-08-18.
 */

// legacy: task_name == 'All Agencies - Administrative' toggles the per-row Professional select
// to a Role select (checkForAdministrativeFeesAction / item.isAAA in invoicescontroller.js).
// Resolved once here, server-side, rather than replicating legacy's own extra per-row
// checkForAdministrativeFees() round-trip on every Item selection.
const AAA_TASK_NAME = "All Agencies - Administrative";

// legacy is genuinely inconsistent about which column identifies the AAA task: everywhere else
// (getTimeExpenseListAction's own dropdown-sort step, generateSummary's PDF bucketing, save-time
// labeling) it's task_abbreviation == 'AAA' - only checkForAdministrativeFeesAction (the live
// Professional->Role toggle once an item is picked, AAA_TASK_NAME above) checks task_name
// instead. Both are reproduced here, each keyed to the one legacy code path it actually matches,
// rather than assuming they're interchangeable.
const AAA_TASK_ABBREVIATION = "AAA";

// legacy injects a synthetic, non-DB-backed "Time(Default)" task at index 1 (right after
// moving the real AAA task to the front) - a generic time line item with no specific task
// type. id 888 has no corresponding time_entry_tasks row; it's only ever meaningful as this
// catalog entry and as the literal expense/task_id value legacy stores when it's chosen
// (getTimeExpenseListAction's $newTask, saveInvoiceAction/updateInvoiceAction just store
// whatever id came through in the "id-type" pair without requiring it to exist in
// time_entry_tasks).
const DEFAULT_TIME_ENTRY = { code: 888, type: "time", description: "Time(Default)", isAAA: false };

/**
 * @description
 * The manual invoice Item dropdown's full option list: Case Referral Fee is
 * added separately by the frontend (it's not in either catalog table) - this
 * returns only the task/expense-type catalog half, in legacy's own order (AAA
 * task moved to front of the time list, then the synthetic Time(Default) entry
 * inserted right after it, time entries before expense entries).
 * @returns {*} { code, type, description, isAAA }[]
 */
export const getItemCatalog = async () => {
  const [tasks, expenseTypes] = await Promise.all([
    TimeEntryTask.findAll({
      where: { isBillable: "1", isActive: "1" },
      attributes: ["id", "taskName", "taskAbbreviation"],
      order: [["id", "ASC"]],
    }),
    TimeEntryExpenseType.findAll({
      where: { isBillable: "1", isActive: "1" },
      attributes: ["id", "expenseType"],
      order: [["id", "ASC"]],
    }),
  ]);

  const timeItems = tasks.map((task) => ({
    code: task.id,
    type: "time",
    description: task.taskName || "",
    isAAA: task.taskName === AAA_TASK_NAME,
    // Sort-only signal, not returned - see AAA_TASK_ABBREVIATION's own doc comment for why this
    // is deliberately a different field than the isAAA flag above.
    isAaaAbbreviation: task.taskAbbreviation === AAA_TASK_ABBREVIATION,
  }));

  const aaaIndex = timeItems.findIndex((item) => item.isAaaAbbreviation);
  if (aaaIndex > 0) {
    const [aaaItem] = timeItems.splice(aaaIndex, 1);
    timeItems.unshift(aaaItem);
  }
  timeItems.splice(1, 0, DEFAULT_TIME_ENTRY);

  const expenseItems = expenseTypes.map((expenseType) => ({
    code: expenseType.id,
    type: "expense",
    description: expenseType.expenseType || "",
    isAAA: false,
  }));

  const publicTimeItems = timeItems.map(({ isAaaAbbreviation, ...item }) => item);

  return [...publicTimeItems, ...expenseItems];
};

/**
 * @description
 * Rate auto-fill when a Professional is selected on a catalog (time/expense)
 * line item - ported from InvoicesController::getProfessionAndRole +
 * getProfessionDetailsAction's two-step lookup: first read the professional's
 * own sub_type_role, then join time_entry_billing_roles on sub_type_role if
 * they have one, otherwise fall back to joining on the coarser 2-value `role`
 * enum via their user_type. Sequelize equivalent of the same two queries -
 * no raw SQL needed.
 * @param {*} professionalId
 * @returns {*} rate (Number) or null if no matching role/rate is found.
 */
export const getProfessionalRate = async (professionalId) => {
  const professional = await JudgeAssistantClerk.findOne({
    where: { userId: professionalId },
    attributes: ["userId", "userType", "subTypeRole"],
  });
  if (!professional) return null;

  const role = professional.subTypeRole
    ? await TimeEntryBillingRole.findOne({ where: { subTypeRole: professional.subTypeRole } })
    : await TimeEntryBillingRole.findOne({ where: { role: professional.userType } });

  return role?.ratePerHour ? Number(role.ratePerHour) : null;
};
