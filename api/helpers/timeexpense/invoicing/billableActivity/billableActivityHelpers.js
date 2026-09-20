import { Op, literal } from "sequelize";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import ExpenseEntry from "../../../../models/timeexpense/timeentry/ExpenseEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Query-building/row-shaping helpers for billableActivityController's
 * getBillableActivityList - split out purely to stay under the 300-line file
 * guideline; no behavior change. The two row-fetching queries themselves
 * (fetchTimeEntries/fetchExpenseEntries) moved out to
 * billableActivityFetchers.js (2026-08-27, same reason) - both import the
 * query-literal builders below back from here.
 */

// FIND_IN_SET against the bracketed agency_work_type(_code) list columns. Matches a given
// agency when agencyDescription is provided, otherwise excludes AAA entries.
export const buildAgencyOrAaaLiteral = (agencyDescription) => {
  if (agencyDescription) {
    return literal(
      `FIND_IN_SET(CONCAT('"', ${sequelize.escape(agencyDescription)}, '"'), REPLACE(REPLACE(agency_work_type, '[', ''), ']', ''))`,
    );
  }
  return literal(
    "NOT FIND_IN_SET('\"AAA\"', REPLACE(REPLACE(agency_work_type_code, '[', ''), ']', ''))",
  );
};

// Primary ORDER BY key for fetchTimeEntries/fetchExpenseEntries - "already added to this
// agency's invoice" rows sort after everything else (0 before 1), computed the same way
// applyInvoiceDisplayLogic does in JS: FIND_IN_SET against the plain (unbracketed) CSV
// added_for_agencies column when a specific agency is selected, otherwise the raw
// added_to_invoice flag. Doing this as a DB-level ORDER BY (not a post-fetch JS sort) is what
// makes the picker's "selectable rows first" behavior hold across the *entire* filtered result
// set, not just whatever page happens to load - a page-local JS sort (legacy's own approach,
// and this port's first attempt at it) only reorders the current LIMIT/OFFSET window, so an
// already-added row can still land above a not-yet-added one that's merely on the next page.
export const buildAddedToInvoiceSortLiteral = (agencyId) => {
  if (agencyId) {
    return literal(`(FIND_IN_SET(${sequelize.escape(String(agencyId))}, added_for_agencies) > 0)`);
  }
  return literal("(added_to_invoice = '1')");
};

// Hourly rate per sub_type_role, batch-fetched once and looked up in JS rather than joined.
export const buildRateBySubTypeRole = async () => {
  const roles = await TimeEntryBillingRole.findAll({
    attributes: ["subTypeRole", "ratePerHour"],
  });
  return new Map(roles.map((role) => [role.subTypeRole, role.ratePerHour]));
};

// Counts billable time entries matching the given filters (no row data - used to work out
// how the requested page splits across the time/expense blocks below).
export const countTimeEntries = async (from, to, agencyDescription, employee) => {
  return TimeEntry.count({
    include: [
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
      ...(employee ? { userId: employee } : {}),
      ...(from && to ? { timeTrackingDateEntry: { [Op.between]: [from, to] } } : {}),
      [Op.and]: [buildAgencyOrAaaLiteral(agencyDescription)],
    },
  });
};

// Counts billable expense entries matching the given filters - see countTimeEntries.
export const countExpenseEntries = async (from, to, agencyDescription, employee) => {
  return ExpenseEntry.count({
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
      isPosted: { [Op.in]: ["1", "2", "3"] },
      ...(employee ? { userId: employee } : {}),
      ...(from && to ? { dateIncurred: { [Op.between]: [from, to] } } : {}),
      [Op.and]: [buildAgencyOrAaaLiteral(agencyDescription)],
    },
  });
};

// Sets addedToInvoice/invoiceNo per row based on the selected agency. With no agency filter,
// an entry split across multiple agencies' invoices shows only the last matching invoice
// number (matches legacy).
export const applyInvoiceDisplayLogic = (entries, agencyId, agencyCodeById) => {
  entries.forEach((entry) => {
    // agencyWorkTypeCode's raw SQL value is bracket/space-stripped but still quote-delimited
    // (e.g. `"BNR-AQ","BNR-BUI"`) - legacy's str_replace('"', ' ', ...) runs on every row
    // unconditionally (InvoicesController.php:3142 etc., outside the added_for_agencies check
    // below), so this must too, not just for rows that have already been added to an invoice.
    entry.agencyWorkTypeCode = (entry.agencyWorkTypeCode || "").replaceAll('"', " ").trim();

    if (!entry.addedForAgencies) {
      return;
    }

    const addedForAgencies = entry.addedForAgencies.split(",");
    if (agencyId && addedForAgencies.includes(String(agencyId))) {
      entry.addedToInvoice = 1;
    } else if (!agencyId && entry.addedToInvoice === "1") {
      entry.addedToInvoice = 1;
    } else {
      entry.addedToInvoice = 0;
    }

    const invoiceNoSegments = (entry.invoiceNo || "").split(",");
    invoiceNoSegments.forEach((segment) => {
      const [segmentAgencyId, segmentInvoiceNo] = segment.split("#");
      if (agencyId && String(agencyId) === segmentAgencyId) {
        entry.invoiceNo = segmentInvoiceNo || "";
      }
      if (!agencyId && segmentAgencyId) {
        const agencyCode = agencyCodeById.get(Number(segmentAgencyId));
        entry.invoiceNo = agencyCode ? `${agencyCode}#${segmentInvoiceNo}` : entry.invoiceNo;
      }
    });
  });
};

/**
 * @description
 * Ported from invoicescontroller.js's three billable-list success handlers
 * (~1894, 2878, 3276), all of which run this exact pair of JS sorts, in this
 * order, on the page's row list:
 *   response.list.sort((a,b) => Date.parse(b.billable_activity_date) - Date.parse(a.billable_activity_date))
 *   response.list.sort((a,b) => Date.parse(a.added_to_invoice) - Date.parse(b.added_to_invoice))
 * The second sort looks broken at a glance (added_to_invoice is a 0/1 flag, not
 * a date) but is NOT dead/no-op code - verified Date.parse(0) and Date.parse(1)
 * both parse to real (if nonsensical) timestamps in V8, and Date.parse(0) <
 * Date.parse(1), so the comparator does correctly group 0 (selectable) before 1
 * (already added). A plain numeric addedToInvoice comparator below is a direct,
 * non-hacky equivalent for that second pass - same outcome, without relying on
 * that Date.parse coincidence.
 *
 * Both passes are required, in this order, not just the second one: this
 * function's caller hands it `[...timeEntries, ...expenseEntries]` - two
 * blocks that are each independently date-sorted (by the DB query itself) but
 * NOT merged with each other. Array.prototype.sort's ES2019+/Node stability
 * guarantee only preserves whatever date order the input already had *within*
 * each addedToInvoice group - which, for a page whose window happens to
 * contain rows from both blocks, would otherwise stay type-blocked (all times
 * before all expenses) instead of properly date-interleaved. Running an
 * explicit global date-desc pass first (mirroring legacy's own first sort, not
 * assumed to be already true of the input) is what makes the second, stable
 * addedToInvoice pass actually preserve a genuine cross-type date order -
 * confirmed live against a real running legacy instance (2026-08-28): legacy's
 * own page 1 genuinely interleaves time and expense rows by date whenever a
 * page's slice window straddles the time/expense boundary (this data's own
 * qualifying counts - 47 time, 119 expense - put that boundary inside legacy's
 * own default 50-per-page window), which a comment here previously claimed
 * without actually implementing the first pass that makes it true (checklist
 * item 22's own trap: a doc comment can be right about the mechanism and still
 * wrong that the code actually does it).
 *
 * Applied once here rather than at each of getBillableActivityList's callers,
 * since (unlike legacy's three separate Angular call sites) this one Node
 * endpoint already backs all three of those legacy scenarios (picker initial
 * load, picker re-search, and the standalone Billable Activity tab).
 * @param {*} entries
 */
export const sortByAddedToInvoice = (entries) => {
  const dateSorted = [...entries].sort(
    (a, b) => new Date(b.billableActivityDate) - new Date(a.billableActivityDate),
  );
  return dateSorted.sort((a, b) => a.addedToInvoice - b.addedToInvoice);
};
