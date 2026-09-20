import { Op, literal } from "sequelize";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { buildRateBySubTypeRole } from "../billableActivity/billableActivityHelpers.js";
import { computeLineTotal, roundMoney } from "../shared/computationHelpers.js";
import { calculateAgencyPercentage, calculateAAAAllocation } from "./precisionHelpers.js";
import {
  hoursFromSplitTime,
  secondsFromSplitTime,
  csvList,
  agencyByDescription,
  ensureAgencyBucket,
  caseReferralFor,
  resolveAgencyDescriptions,
} from "./bulkInvoiceLookupHelpers.js";

/**
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups > Create preview - non-AAA billable time entries, fanned
 * out per agency. Ported from BulkinvoicesController::getOnlyTimeEntries.
 */

const AAA_AGENCY_CODE = "AAA";

/**
 * @description
 * Bills one time-entry row's hours/amount into every agency bucket it resolves
 * to, skipping an agency description that can't be resolved at all or that this
 * entry was already invoiced for (added_for_agencies). onAgencyBilled is called
 * once per successfully-billed agency so the caller can accumulate totalTime in
 * exactly the same order/rounding sequence the un-extracted version did.
 * Extracted purely to keep buildAgencyTimeEntries' own cognitive complexity
 * down - no behavior change.
 * @param {*} rowData
 * @param {*} bucket
 * @param {*} onAgencyBilled
 */
const applyRowToAgencyBuckets = async (rowData, bucket, onAgencyBilled) => {
  const {
    agencyDescriptions,
    addedForAgencyIds,
    hours,
    totalSeconds,
    timeBilled,
    assignCaseReferralData,
    caseReferralFee,
  } = rowData;

  for (const agencyDescription of agencyDescriptions) {
    const agencyInfo = await agencyByDescription(agencyDescription);
    if (!agencyInfo || addedForAgencyIds.includes(String(agencyInfo.id))) continue;

    onAgencyBilled(hours);
    const entry = ensureAgencyBucket(bucket, agencyDescription);
    entry.totalNonAdminBillableHours += totalSeconds;
    entry.agencyTimeBilledAmount = roundMoney(entry.agencyTimeBilledAmount + timeBilled);
    entry.agencyTime = roundMoney(entry.agencyTime + hours);
    entry.agencyId = agencyInfo.id;
    entry.agencyEmail = agencyInfo.email || "";
    entry.agencyCode = agencyInfo.agencyCode || "";
    Object.assign(entry, caseReferralFor(assignCaseReferralData, agencyInfo.id, caseReferralFee));
  }
};

/**
 * @description
 * Pulls every non-AAA, billable, submitted time entry in the date range and fans
 * each one out across every agency it's split to (one time entry can bill several
 * agencies at once, via its `agencies`/`agency_work_type` CSV columns), building a
 * per-agency-description bucket of billed hours/amount. Mirrors getOnlyTimeEntries
 * exactly - including its two-step agency resolution (agencies CSV of ids ->
 * agency_description via a lookup query, falling back to agency_work_type's own
 * bracketed description list when `agencies` is empty) and its per-agency
 * added_for_agencies exclusion (an entry already invoiced *for this specific
 * agency* is skipped for that agency only, not for every agency it's split to).
 * @param {*} billDateFrom
 * @param {*} billDateTo
 * @param {*} assignCaseReferralData
 * @param {*} caseReferralFee
 */
export const buildAgencyTimeEntries = async (billDateFrom, billDateTo, assignCaseReferralData, caseReferralFee) => {
  const rateBySubTypeRole = await buildRateBySubTypeRole();

  const rows = await TimeEntry.findAll({
    attributes: [
      "id",
      "agencies",
      "addedForAgencies",
      "splitTimeBtwnAgency",
      // Raw column, no SQL-level REPLACE at all - matches bulkInvoiceExpenseHelpers.js's own
      // (correct) agencyWorkType attribute exactly. csvList's own implementation strips
      // brackets/quotes unconditionally BEFORE splitting (see bulkInvoiceLookupHelpers.js), so a
      // '","' separator can never match once quotes are already gone - a SQL-level REPLACE that
      // stripped quotes here (a prior version of this line) silently broke csvList's split
      // entirely, collapsing every multi-agency entry's whole agency list into one unmatched,
      // comma-joined description (e.g. "DHS - Medicaid,DHS-SNAP") that then failed the agency
      // lookup and silently dropped the entry for EVERY agency it should have billed - confirmed
      // real bug (2026-08-27) against real data: 92% of all time_entry rows have no `agencies`
      // id-CSV populated (so always hit this fallback), and 201 of those are genuinely
      // multi-agency splits that were being dropped entirely. Fixed by letting csvList do ALL the
      // stripping itself (from the untouched raw value) and splitting on a plain "," below -
      // safe since no real agency_description contains a literal comma (confirmed against the
      // live time_entry_billable_agency table), matching the expense-entries sibling exactly.
      "agencyWorkType",
    ],
    include: [
      { model: JudgeAssistantClerk, as: "employee", attributes: ["subTypeRole"], required: true },
      {
        model: TimeEntryTask,
        as: "taskDetail",
        attributes: [],
        where: { isBillable: "1", isActive: "1" },
        required: true,
      },
    ],
    where: {
      isDeleted: "0",
      isSubmitted: "2",
      timeTrackingDateEntry: { [Op.between]: [billDateFrom, billDateTo] },
      [Op.and]: [
        literal(`NOT FIND_IN_SET('"${AAA_AGENCY_CODE}"', REPLACE(REPLACE(agency_work_type_code, '[', ''), ']', ''))`),
      ],
    },
  });

  const bucket = {};
  let totalTime = 0;
  const agencyDescCache = new Map(); // agency_id -> agency_description, avoids refetching per row

  for (const row of rows) {
    const plain = row.toJSON();
    const subTypeRole = plain.employee?.subTypeRole;
    const ratePerHour = Number(rateBySubTypeRole.get(subTypeRole)) || 0;
    const splitTime = plain.splitTimeBtwnAgency;
    if (!ratePerHour || !splitTime || splitTime === "00:00:00") continue;

    // See resolveAgencyDescriptions' own doc comment for why "," is the right separator either
    // way, regardless of which of the two sources (agencies id-CSV vs agencyWorkType) this row
    // resolves through.
    const agencyDescriptions = await resolveAgencyDescriptions(plain, agencyDescCache);

    const addedForAgencyIds = csvList(plain.addedForAgencies, ",");
    const totalSeconds = secondsFromSplitTime(splitTime);
    const hours = hoursFromSplitTime(splitTime);
    const timeBilled = computeLineTotal(ratePerHour, hours);

    await applyRowToAgencyBuckets(
      { agencyDescriptions, addedForAgencyIds, hours, totalSeconds, timeBilled, assignCaseReferralData, caseReferralFee },
      bucket,
      (billedHours) => {
        totalTime = roundMoney(totalTime + billedHours);
      },
    );
  }

  return { bucket, totalTime };
};

/**
 * @description
 * agency_time / total_time (both hours), truncated %, then that % applied to the
 * pooled AAA amount - one allocation per agency bucket. Mirrors
 * getOnlyTimeEntries' own post-loop percentage/allocation pass exactly
 * (calculateAgencyPercentage / calculateAAAAllocation, both truncating, not
 * rounding).
 * @param {*} bucket
 * @param {*} totalTime
 * @param {*} aaaTotalAmount
 */
export const applyAgencyPercentagesAndAllocation = (bucket, totalTime, aaaTotalAmount) => {
  let totalPercentage = 0;
  let totalAdminAllocationFee = 0;
  Object.values(bucket).forEach((entry) => {
    const percentage = calculateAgencyPercentage(entry.agencyTime, totalTime);
    const allocation = calculateAAAAllocation(percentage, aaaTotalAmount);
    entry.hourPercentages = percentage;
    entry.agencyAaaAmount = allocation;
    totalPercentage += Number(percentage);
    totalAdminAllocationFee += Number(allocation);
  });
  return { totalPercentage, totalAdminAllocationFee: roundMoney(totalAdminAllocationFee) };
};
