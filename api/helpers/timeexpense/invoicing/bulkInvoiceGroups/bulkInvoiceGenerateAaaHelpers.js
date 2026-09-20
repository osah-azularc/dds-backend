import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import { AAA_TYPE_LABELS } from "./bulkInvoiceAaaHelpers.js";
import { calculateAaaRoleQuantity } from "./precisionHelpers.js";
import { computeLineTotal, roundMoney } from "../shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > Generate Invoices - the AAA (Administrative Law Judge/
 * Staff Attorney/Law Clerk/Special Assistant ALJ) role lookup + per-agency AAA
 * invoice_items row building. Split out of bulkInvoiceGenerateHelpers.js
 * (2026-08-27) purely to stay under the 300-line file guideline - no behavior
 * change. fetchAgencyBillableItems/generateInvoicesForAgencies (the non-AAA
 * data-gathering + the actual per-agency create loop) stay in that file, which
 * calls loadAaaLookups/buildAaaInvoiceItemRows from here.
 */

// AAA role code -> sub_type_role value stored on judge_assistant_clerk / read from
// time_entry_billing_roles.sub_type_role (bulkInvoiceAaaHelpers.js's own SUB_TYPE_ROLE_TO_CODE,
// inverted - kept local rather than exported/inverted there since nothing else needs this
// direction).
const CODE_TO_SUB_TYPE_ROLE = { ALJ: "judge", SA: "sa", "Law Clerk": "law_clerk", SAALJ: "saalj" };
const LABEL_TO_CODE = new Map(Object.entries(AAA_TYPE_LABELS).map(([code, label]) => [label, code]));

// time_entry_billing_roles.id per AAA role code, batch-fetched once per Generate Invoices run
// (not once per agency) - matches getAgencyTimeEntries's own per-role lookups, just hoisted out
// of the per-agency loop since the 4 role ids never vary within one run.
const fetchAaaRoleIds = async () => {
  const roles = await TimeEntryBillingRole.findAll({
    where: { subTypeRole: Object.values(CODE_TO_SUB_TYPE_ROLE) },
    attributes: ["id", "subTypeRole"],
  });
  const bySubTypeRole = new Map(roles.map((role) => [role.subTypeRole, role.id]));
  const byCode = new Map();
  Object.entries(CODE_TO_SUB_TYPE_ROLE).forEach(([code, subTypeRole]) => {
    byCode.set(code, bySubTypeRole.get(subTypeRole) || 0);
  });
  return byCode;
};

// time_entry_tasks.id where task_abbreviation = 'AAA' - the task_id every AAA role's own
// invoice_items row uses (matches saveInvoiceItems's single `$aaa_id` lookup, shared by all 4
// role branches).
const fetchAaaTaskId = async () => {
  const task = await TimeEntryTask.findOne({ where: { taskAbbreviation: "AAA" }, attributes: ["id"] });
  return task?.id || 0;
};

/**
 * @description
 * One-time (per Generate Invoices run) lookup bundle for buildAaaInvoiceItemRows
 * below - fetched once, passed into every agency's own call, since none of it
 * varies per agency.
 */
export const loadAaaLookups = async () => {
  const [roleIdByCode, aaaTaskId] = await Promise.all([fetchAaaRoleIds(), fetchAaaTaskId()]);
  return { roleIdByCode, aaaTaskId };
};

/**
 * @description
 * Builds this agency's AAA role invoice_items rows (one per role present in the
 * group's own aaaEntries with real hours) - mirrors saveInvoiceItems's 4 near-
 * identical ALJ/SA/Law Clerk/SAALJ branches as one loop instead of 4 copies
 * (checklist item 6 - the branches are otherwise pure duplication). Skipped
 * entirely when this agency's own agencyAaaAmount is 0 (matches legacy's
 * `if(agency['agency_aaa_amount']!=0)` outer guard) - an agency with zero AAA
 * allocation gets no AAA line items regardless of the group's own aaaEntries.
 * @param {*} agency
 * @param {*} aaaEntries
 * @param {*} aaaLookups
 * @param {*} params
 * @param {*} invNo
 * @param {*} createdBy
 * @param {*} now }
 * @returns {*} { rows: InvoiceItem-shaped rows[], perInvoiceAaaAmount } - perInvoiceAaaAmount is the sum of every row's own total, matching legacy's own $perInvoiceAAAamount (written back onto invoices.aaa_total in legacy - NOT reproduced here, see Invoice.js's own "KNOWN GAP" doc comment: that column doesn't exist on the live table).
 */
export const buildAaaInvoiceItemRows = (agency, aaaEntries, aaaLookups, { invId, invNo, createdBy, now }) => {
  if (!Number(agency.agencyAaaAmount)) return { rows: [], perInvoiceAaaAmount: 0 };

  const agencyPercentage = agency.hourPercentages || 0;
  let perInvoiceAaaAmount = 0;

  const rows = (aaaEntries || [])
    .map((entry) => {
      const code = LABEL_TO_CODE.get(entry.administrativeFeeType);
      const roleId = code ? aaaLookups.roleIdByCode.get(code) : 0;
      const totalHours = Number(entry.totalHoursIncurred) || 0;
      const rate = Number(entry.hourlyRate) || 0;
      if (!code || !totalHours) return null;

      const quantity = calculateAaaRoleQuantity(totalHours, agencyPercentage);
      const total = computeLineTotal(quantity, rate);
      perInvoiceAaaAmount = roundMoney(perInvoiceAaaAmount + total);

      return {
        invId,
        invNo,
        expense: aaaLookups.aaaTaskId,
        itemType: "time",
        itemName: "Manual",
        taskId: aaaLookups.aaaTaskId,
        professional: roleId,
        quantity,
        rate,
        unit: "per hr/item",
        total,
        isDeleted: 0,
        createdBy,
        createdAt: now,
      };
    })
    .filter(Boolean);

  return { rows, perInvoiceAaaAmount };
};
