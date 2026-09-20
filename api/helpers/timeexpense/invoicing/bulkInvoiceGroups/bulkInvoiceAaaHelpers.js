import { Op, literal } from "sequelize";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { buildRateBySubTypeRole } from "../billableActivity/billableActivityHelpers.js";
import { computeLineTotal, roundMoney } from "../shared/computationHelpers.js";
import { hoursFromSplitTime } from "./bulkInvoiceLookupHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups > Create preview - the pooled AAA (All Agencies -
 * Administrative) admin-fee amount, bucketed by role. Ported from
 * BulkinvoicesController::getOnlyAAAEntries. This is later allocated across
 * agencies by each agency's share of total non-AAA billable hours
 * (bulkInvoiceAgencyTimeHelpers.js's applyAgencyPercentagesAndAllocation).
 */

const AAA_AGENCY_CODE = "AAA";

// judge_assistant_clerk.sub_type_role -> AAA-entries grouping key/display code.
const SUB_TYPE_ROLE_TO_CODE = { judge: "ALJ", sa: "SA", saalj: "SAALJ", law_clerk: "Law Clerk" };
// Exported for bulkInvoiceGenerateHelpers.js's own reverse lookup (administrativeFeeType label ->
// role code) - the stored/preview aaaEntries array carries only the label, not the role code
// legacy's own generateBulkInvoicesAction indexes aaa_entries by ($param['aaa_entries']['ALJ']).
export const AAA_TYPE_LABELS = {
  ALJ: "Administrative Law Judge(ALJ)",
  SA: "Staff Attorney(SA)",
  SAALJ: "Special Assistant Administrative Law Judge(SAALJ)",
  "Law Clerk": "Law Clerk",
};
const roleCodeFor = (subTypeRole) => SUB_TYPE_ROLE_TO_CODE[subTypeRole] || String(subTypeRole || "").toUpperCase();

/**
 * @description
 * Pulls every AAA-coded, not-yet-invoiced, billable time entry in the date range
 * and buckets it by role. Mirrors getOnlyAAAEntries exactly, including its one
 * real asymmetry vs the non-AAA query (bulkInvoiceAgencyTimeHelpers.js): no
 * task_billable_active filter on this branch (legacy's own SQL doesn't have one
 * here), and this is the ONLY branch that excludes already-invoiced entries at
 * the SQL level (added_to_invoice != '1') - the non-AAA branch instead excludes
 * per-agency, one layer down (an entry can be invoiced for one agency but not
 * another it's also split to).
 * @param {*} billDateFrom
 * @param {*} billDateTo
 */
export const fetchAaaEntries = async (billDateFrom, billDateTo) => {
  const rateBySubTypeRole = await buildRateBySubTypeRole();

  const rows = await TimeEntry.findAll({
    attributes: ["id", "splitTimeBtwnAgency"],
    include: [
      { model: JudgeAssistantClerk, as: "employee", attributes: ["subTypeRole"], required: true },
      {
        model: TimeEntryTask,
        as: "taskDetail",
        attributes: [],
        where: { isBillable: "1" },
        required: true,
      },
    ],
    where: {
      addedToInvoice: { [Op.ne]: "1" },
      isDeleted: "0",
      isSubmitted: "2",
      timeTrackingDateEntry: { [Op.between]: [billDateFrom, billDateTo] },
      [Op.and]: [
        literal(`FIND_IN_SET('"${AAA_AGENCY_CODE}"', REPLACE(REPLACE(agency_work_type_code, '[', ''), ']', ''))`),
      ],
    },
  });

  const byRole = {};
  let totalHours = 0;
  let totalAmount = 0;
  const allAaaEntries = [];

  rows.forEach((row) => {
    const plain = row.toJSON();
    const subTypeRole = plain.employee?.subTypeRole;
    const roleCode = roleCodeFor(subTypeRole);
    const hours = hoursFromSplitTime(plain.splitTimeBtwnAgency);
    const ratePerHour = Number(rateBySubTypeRole.get(subTypeRole)) || 0;
    const amount = computeLineTotal(ratePerHour, hours);

    if (!byRole[roleCode]) {
      byRole[roleCode] = {
        administrativeFeeType: AAA_TYPE_LABELS[roleCode] || roleCode,
        totalHoursIncurred: 0,
        hourlyRate: ratePerHour,
        administrativeFeeAmount: 0,
      };
    }
    byRole[roleCode].totalHoursIncurred = roundMoney(byRole[roleCode].totalHoursIncurred + hours);
    byRole[roleCode].administrativeFeeAmount = roundMoney(byRole[roleCode].administrativeFeeAmount + amount);
    totalHours = roundMoney(totalHours + hours);
    totalAmount = roundMoney(totalAmount + amount);
    allAaaEntries.push(plain);
  });

  return { byRole, totalHours, totalAmount, allAaaEntries };
};
