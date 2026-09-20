import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import ExpenseEntry from "../../../../models/timeexpense/timeentry/ExpenseEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { buildRateBySubTypeRole } from "../billableActivity/billableActivityHelpers.js";
import { computeLineTotal, roundMoney } from "./computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * Save-time linkage between a manual invoice's billable-activity-sourced line
 * items (picked via Add Billable Activity, not typed in) and their source
 * time_entry/expense_entry rows - ported from
 * InvoicesController::saveInvoiceAction's billable branch (~2448-2528) and
 * updateInvoiceAction's remove/re-add reconciliation (~2728-2960).
 *
 * A "billable" item is one where item.billable === true - set by the frontend
 * only for rows that came out of the Add Billable Activity picker, never for
 * manually-typed 'other'/catalog rows (see manualInvoiceHelpers.js's
 * buildInvoiceItemRows for those).
 */

const toList = (csv) => (csv ? String(csv).split(",").filter(Boolean) : []);
const toCsv = (list) => list.join(",");

// Adds this agency/invoice's tokens onto the entry's CSV columns - guarded against duplicates
// (legacy's own create path didn't guard this, its edit re-add path did via
// `in_array(...)==false`; guarding unconditionally here closes that inconsistency rather than
// reproducing it, consistent with the duplicate-add fix already agreed for the picker UI).
const buildLinkedColumns = (entry, agencyId, invoiceId, invNo) => {
  const agencies = toList(entry.addedForAgencies);
  const invoiceIds = toList(entry.invoiceId);
  const invoiceNos = toList(entry.invoiceNo);

  const agencyToken = String(agencyId);
  if (!agencies.includes(agencyToken)) agencies.push(agencyToken);

  const invoiceIdToken = `${agencyId}-${invoiceId}`;
  if (!invoiceIds.includes(invoiceIdToken)) invoiceIds.push(invoiceIdToken);

  const invoiceNoToken = `${agencyId}#${invNo}`;
  if (!invoiceNos.includes(invoiceNoToken)) invoiceNos.push(invoiceNoToken);

  return {
    addedForAgencies: toCsv(agencies),
    invoiceId: toCsv(invoiceIds),
    invoiceNo: toCsv(invoiceNos),
    agencyCountAfter: agencies.length,
  };
};

// Removes this agency/invoice's tokens from the entry's CSV columns - mirrors
// updateInvoiceAction's removeEntries reconciliation (~2728-2791) exactly.
const buildUnlinkedColumns = (entry, agencyId, invoiceId, invNo) => {
  const agencyToken = String(agencyId);
  const agencies = toList(entry.addedForAgencies).filter((value) => value !== agencyToken);
  const invoiceIds = toList(entry.invoiceId).filter((value) => value !== `${agencyId}-${invoiceId}`);
  const invoiceNos = toList(entry.invoiceNo).filter((value) => value !== `${agencyId}#${invNo}`);

  return {
    addedForAgencies: toCsv(agencies),
    invoiceId: toCsv(invoiceIds),
    invoiceNo: toCsv(invoiceNos),
    agencyCountAfter: agencies.length,
  };
};

// Number of agencies this expense entry could ever be split across (agency_work_type_code is a
// bracketed, quoted CSV of codes, e.g. `["BNR","DFCS"]`) - legacy compares this count against
// the post-link added_for_agencies count to decide is_posted 2 (fully invoiced) vs 3 (partial).
const totalAgencyCountFor = (entry) =>
  (entry.agencyWorkTypeCode || "").replaceAll(/[[\]"]/g, "").split(",").filter(Boolean).length;

const billableItemsByType = (items, itemType) =>
  items.filter((item) => item.billable && item.itemType === itemType);

/**
 * @description
 * Links every billable-sourced item in `items` to the given invoice - appends
 * this agency's tokens onto each source time_entry/expense_entry row's CSV
 * columns, sets added_to_invoice='1', and (expenses only) recomputes is_posted.
 * Called after the invoice + its InvoiceItem rows have been written, inside the
 * same transaction (matches legacy - saveInvoiceAction does this update
 * immediately after each invoice_items insert).
 * @param {*} items
 * @param {*} params
 * @param {*} invoiceId
 * @param {*} invNo
 * @param {*} transaction }
 */
export const linkBillableItemsToInvoice = async (items, { agencyId, invoiceId, invNo, transaction }) => {
  await Promise.all([
    ...billableItemsByType(items, "time").map(async (item) => {
      const entry = await TimeEntry.findByPk(item.itemCode, { transaction, lock: transaction.LOCK.UPDATE });
      if (!entry) return;
      const { agencyCountAfter, ...columns } = buildLinkedColumns(entry, agencyId, invoiceId, invNo);
      await entry.update({ ...columns, addedToInvoice: "1" }, { transaction });
    }),
    ...billableItemsByType(items, "expense").map(async (item) => {
      const entry = await ExpenseEntry.findByPk(item.itemCode, { transaction, lock: transaction.LOCK.UPDATE });
      if (!entry) return;
      const { agencyCountAfter, ...columns } = buildLinkedColumns(entry, agencyId, invoiceId, invNo);
      const totalAgencyCount = totalAgencyCountFor(entry);
      const isPosted = totalAgencyCount > 0 && agencyCountAfter === totalAgencyCount ? "2" : "3";
      await entry.update({ ...columns, addedToInvoice: "1", isPosted }, { transaction });
    }),
  ]);
};

/**
 * @description
 * Reverses linkBillableItemsToInvoice for items removed from an invoice on Edit
 * (present in the invoice's prior saved items, absent from the new submission) -
 * mirrors updateInvoiceAction's removeEntries reconciliation (~2728-2791): pulls
 * this agency's tokens back out, resets added_to_invoice to '0' only if this was
 * the entry's only agency, and (expenses only) resets is_posted to '1' (fully
 * un-invoiced) if it was the only agency, else '3' (still partially invoiced by
 * others) - note this does NOT re-derive '2', matching legacy exactly (removal
 * never results back in is_posted=2).
 * @param {*} items
 * @param {*} params
 * @param {*} invoiceId
 * @param {*} invNo
 * @param {*} transaction }
 */
export const unlinkBillableItemsFromInvoice = async (items, { agencyId, invoiceId, invNo, transaction }) => {
  await Promise.all([
    ...billableItemsByType(items, "time").map(async (item) => {
      const entry = await TimeEntry.findByPk(item.itemCode, { transaction, lock: transaction.LOCK.UPDATE });
      if (!entry) return;
      const { agencyCountAfter, ...columns } = buildUnlinkedColumns(entry, agencyId, invoiceId, invNo);
      await entry.update(
        { ...columns, ...(agencyCountAfter === 0 ? { addedToInvoice: "0" } : {}) },
        { transaction },
      );
    }),
    ...billableItemsByType(items, "expense").map(async (item) => {
      const entry = await ExpenseEntry.findByPk(item.itemCode, { transaction, lock: transaction.LOCK.UPDATE });
      if (!entry) return;
      const { agencyCountAfter, ...columns } = buildUnlinkedColumns(entry, agencyId, invoiceId, invNo);
      const isPosted = agencyCountAfter === 0 ? "1" : "3";
      await entry.update(
        { ...columns, isPosted, ...(agencyCountAfter === 0 ? { addedToInvoice: "0" } : {}) },
        { transaction },
      );
    }),
  ]);
};

/**
 * @description
 * Server-authoritative resolution of a billable item's professional/quantity/
 * rate/name/taskId - the client only ever sends itemCode/itemType/billable for
 * these rows (see manualInvoiceValidation's billableInvoiceItemSchema), never
 * the amounts themselves, so a stale or tampered picker selection can't affect
 * what actually gets billed. Mirrors the same source-of-truth fields the
 * Billable Activity browse endpoints already compute (billableActivityHelpers.js)
 * rather than re-deriving them a second, possibly-divergent way.
 * @param {*} items
 * @returns {*} Map<"time-<id>"|"expense-<id>", { professional, quantity, rate, itemName, taskId, total, addedForAgencies }> - entries with no matching source row are simply absent (the caller rejects the whole save if any requested billable item doesn't resolve). addedForAgencies (raw CSV list of agency ids already invoiced for this entry) lets the caller reject picking an entry that's already been added for the invoice's own agency - the picker UI disables this case client-side, but the backend must not rely on that alone.
 */
export const resolveBillableItemDetails = async (items) => {
  const timeIds = billableItemsByType(items, "time").map((item) => item.itemCode);
  const expenseIds = billableItemsByType(items, "expense").map((item) => item.itemCode);
  const result = new Map();
  if (timeIds.length === 0 && expenseIds.length === 0) return result;

  const rateBySubTypeRole = await buildRateBySubTypeRole();

  const [timeEntries, expenseEntries] = await Promise.all([
    timeIds.length
      ? TimeEntry.findAll({
          where: { id: timeIds },
          include: [
            { model: TimeEntryTask, as: "taskDetail", attributes: ["id", "taskName"], required: false },
            { model: JudgeAssistantClerk, as: "employee", attributes: ["subTypeRole"], required: false },
          ],
        })
      : Promise.resolve([]),
    expenseIds.length
      ? ExpenseEntry.findAll({
          where: { id: expenseIds },
          include: [
            {
              model: TimeEntryExpenseType,
              as: "expenseTypeDetail",
              attributes: ["id", "expenseType"],
              required: false,
            },
          ],
        })
      : Promise.resolve([]),
  ]);

  timeEntries.forEach((row) => {
    const plain = row.toJSON();
    const subTypeRole = plain.employee?.subTypeRole;
    const rate = subTypeRole ? Number(rateBySubTypeRole.get(subTypeRole)) || 0 : 0;
    // Matches fetchTimeEntries' own quantity formula (billableActivityHelpers.js) - hours
    // billed to this agency for this entry.
    const quantity = plain.splitTimeBtwnAgency
      ? roundMoney(timeToHours(plain.splitTimeBtwnAgency))
      : 0;
    result.set(`time-${plain.id}`, {
      professional: plain.userId,
      quantity,
      rate,
      itemName: plain.taskDetail?.taskName || "",
      taskId: plain.taskDetail?.id ?? plain.id,
      total: computeLineTotal(quantity, rate),
      addedForAgencies: toList(plain.addedForAgencies),
    });
  });

  expenseEntries.forEach((row) => {
    const plain = row.toJSON();
    result.set(`expense-${plain.id}`, {
      professional: plain.userId,
      quantity: null,
      rate: Number(plain.roundedAmount) || 0,
      itemName: plain.expenseTypeDetail?.expenseType || "",
      // Real time_entry_expense_types.id when resolvable, matching the time-entry branch above
      // (plain.taskDetail?.id) - was plain.id (the expense_entry's own id) until 2026-08-19,
      // which silently broke invoice_items.task_id for every billable expense row: legacy's own
      // generateSummary SQL joins time_entry_expense_types ON teet.id = i.task_id, so task_id
      // has to be the catalog id, not the source entry's id, for that join (and this app's own
      // invoicePdfSections.js bucketing, which relies on the same column) to ever match anything.
      taskId: plain.expenseTypeDetail?.id ?? plain.id,
      addedForAgencies: toList(plain.addedForAgencies),
      total: roundMoney(Number(plain.roundedAmount) || 0),
    });
  });

  return result;
};

// split_time_btwn_agency comes back from Sequelize as "HH:MM:SS" - convert to decimal hours,
// matching legacy's ROUND(TIME_TO_SEC(split_time_btwn_agency)/3600, 2) SQL expression.
const timeToHours = (value) => {
  const [hours = 0, minutes = 0, seconds = 0] = String(value).split(":").map(Number);
  return hours + minutes / 60 + seconds / 3600;
};
