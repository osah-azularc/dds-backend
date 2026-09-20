import { Op, literal } from "sequelize";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import ExpenseEntry from "../../../../models/timeexpense/timeentry/ExpenseEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { buildRateBySubTypeRole } from "../billableActivity/billableActivityHelpers.js";
import { computeLineTotal } from "../shared/computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail > Billable Activity tab. Ported from
 * BulkinvoicesController::getAgencyTimeEntries/getAgencyExpenseEntries as called
 * with page='billableActivity' (getBulkInvoiceGroupBillableActivityAction) - the
 * one call site of those two functions that does NOT exclude entries already
 * added to another invoice (that exclusion only applies to the Create-form's own
 * preview computation, bulkInvoiceAgencyTimeHelpers.js/
 * bulkInvoiceExpenseHelpers.js - a deliberately different query shape, not
 * reused here).
 *
 * One query per group agency, exactly like legacy's own per-agency loop (not one
 * OR'd query across every agency) - deliberately, so an entry billed to more than
 * one of this group's agencies still appears once per matching agency (each
 * showing that agency's own description), matching legacy's real duplication
 * behavior, and so each row can carry its own `agency` description at all (a
 * single merged query has no way to know *which* group agency matched a given
 * row once more than one could).
 *
 * Deliberately NOT built by extending billableActivityHelpers.js's own
 * fetchTimeEntries/fetchExpenseEntries (checklist item 11 - those are shared,
 * already-shipped code backing the standalone Billable Activity tab; this screen
 * needs a different WHERE shape - one specific agency at a time, never "all
 * non-AAA" - so a new, dedicated query lives here instead of risking a regression
 * to that already-proven screen).
 */

const buildAgencyLiteral = (agencyDescription) =>
  literal(
    `FIND_IN_SET(CONCAT('"', ${sequelize.escape(agencyDescription)}, '"'), REPLACE(REPLACE(agency_work_type, '[', ''), ']', ''))`,
  );

const fetchAgencyTimeEntries = async ({ agencyDescription, agencyId, from, to, employee, rateBySubTypeRole }) => {
  const rows = await TimeEntry.findAll({
    attributes: [
      "id",
      "userId",
      "timeTrackingDateEntry",
      [literal("ROUND(TIME_TO_SEC(split_time_btwn_agency) / 3600, 2)"), "quantity"],
      "addedToInvoice",
      "invoiceNo",
      "addedForAgencies",
      // Confirmed live (2026-08-26, direct legacy comparison) - the Agency Name cell shows the
      // entry's *full* work-type code list ("(BNR-AQ,BNR-BUI,...) BNR - Air Quality"), not just
      // the current row's own agency description - matches
      // viewBulkInvoiceGroupBillableActivity.phtml's `({{item.agency_work_type_code |
      // removeQuotes}}) {{item.agency}}` exactly.
      [
        literal("REPLACE(REPLACE(REPLACE(agency_work_type_code, ' ', ''), '[', ''), ']', '')"),
        "agencyWorkTypeCode",
      ],
    ],
    include: [
      {
        model: TimeEntryTask,
        as: "taskDetail",
        attributes: ["taskName"],
        where: { isBillable: "1", isActive: "1" },
        required: true,
      },
      {
        model: JudgeAssistantClerk,
        as: "employee",
        attributes: ["userId", "firstName", "lastName", "subTypeRole"],
        required: false,
      },
    ],
    where: {
      isDeleted: "0",
      isSubmitted: "2",
      ...(employee ? { userId: employee } : {}),
      ...(from && to ? { timeTrackingDateEntry: { [Op.between]: [from, to] } } : {}),
      [Op.and]: [buildAgencyLiteral(agencyDescription)],
    },
    order: [["timeTrackingDateEntry", "DESC"]],
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    const subTypeRole = plain.employee?.subTypeRole;
    const rate = subTypeRole ? Number(rateBySubTypeRole.get(subTypeRole)) || 0 : 0;
    const quantity = Number(plain.quantity) || 0;
    // Matches getAgencyTimeEntries: added_to_invoice only flips to "1" here when *this specific*
    // group agency's id is in the entry's own added_for_agencies CSV, not the raw column value.
    const addedForAgencyIds = (plain.addedForAgencies || "").split(",");
    return {
      id: plain.id,
      type: "time",
      category: "Adjudiction Fee(Time)",
      agency: agencyDescription,
      agencyWorkTypeCode: (plain.agencyWorkTypeCode || "").replaceAll('"', ""),
      billableActivityDate: plain.timeTrackingDateEntry,
      taskName: plain.taskDetail?.taskName ?? null,
      firstName: plain.employee?.firstName ?? null,
      lastName: plain.employee?.lastName ?? null,
      quantity,
      rate,
      totalAmount: computeLineTotal(quantity, rate),
      addedToInvoice: addedForAgencyIds.includes(String(agencyId)) ? "1" : "0",
      invoiceNo: plain.invoiceNo,
    };
  });
};

const fetchAgencyExpenseEntries = async ({ agencyDescription, agencyId, from, to, employee }) => {
  const rows = await ExpenseEntry.findAll({
    attributes: [
      "id",
      "userId",
      "roundedAmount",
      "dateIncurred",
      "addedToInvoice",
      "invoiceNo",
      "addedForAgencies",
      [
        literal("REPLACE(REPLACE(REPLACE(agency_work_type_code, ' ', ''), '[', ''), ']', '')"),
        "agencyWorkTypeCode",
      ],
    ],
    include: [
      {
        model: TimeEntryExpenseType,
        as: "expenseTypeDetail",
        attributes: ["expenseType"],
        where: { isBillable: "1", isActive: "1" },
        required: true,
      },
      {
        model: JudgeAssistantClerk,
        as: "employee",
        attributes: ["userId", "firstName", "lastName"],
        required: false,
      },
    ],
    where: {
      isDeleted: "0",
      isPosted: { [Op.in]: ["1", "2", "3"] },
      ...(employee ? { userId: employee } : {}),
      ...(from && to ? { dateIncurred: { [Op.between]: [from, to] } } : {}),
      [Op.and]: [buildAgencyLiteral(agencyDescription)],
    },
    order: [["dateIncurred", "DESC"]],
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    const addedForAgencyIds = (plain.addedForAgencies || "").split(",");
    return {
      id: plain.id,
      type: "expense",
      category: "Expenses",
      agency: agencyDescription,
      agencyWorkTypeCode: (plain.agencyWorkTypeCode || "").replaceAll('"', ""),
      billableActivityDate: plain.dateIncurred,
      expenseTypesNames: plain.expenseTypeDetail?.expenseType ?? null,
      firstName: plain.employee?.firstName ?? null,
      lastName: plain.employee?.lastName ?? null,
      totalAmount: Number(plain.roundedAmount) || 0,
      addedToInvoice: addedForAgencyIds.includes(String(agencyId)) ? "1" : "0",
      invoiceNo: plain.invoiceNo,
    };
  });
};

/**
 * @description
 * Every billable time+expense entry across the given agencies/date range,
 * already-invoiced entries included (unlike the standalone Billable Activity
 * tab), sorted date desc with already-added rows pushed last, then paginated.
 * Legacy instead concatenates each agency's own already-date-sorted block
 * (agency1 time, agency1 expense, agency2 time, ...) and paginates *that*, only
 * re-sorting the returned page slice client-side - real, confirmed behavior, but
 * an accidental artifact of doing pagination before a global merge sort, not a
 * business rule (checklist item 8). A real, page-independent global sort here is
 * the same deliberate improvement billableActivityHelpers.js's own
 * buildAddedToInvoiceSortLiteral comment already established for the sibling
 * standalone Billable Activity tab - applying that same precedent, not a fresh
 * product decision.
 * @param {Object} params - agencies ({ description, id }[]) - every agency pulled into the bulk group, or just the one selected by the Agency filter. from/to (String, YYYY-MM-DD). employee (Number|""). page/pageSize (Number).
 * @returns {*} { list, total }
 */
export const fetchGroupBillableActivity = async ({ agencies, from, to, employee, page, pageSize }) => {
  const rateBySubTypeRole = await buildRateBySubTypeRole();

  const perAgencyResults = await Promise.all(
    agencies.map(async ({ description, id }) => {
      const [timeEntries, expenseEntries] = await Promise.all([
        fetchAgencyTimeEntries({ agencyDescription: description, agencyId: id, from, to, employee, rateBySubTypeRole }),
        fetchAgencyExpenseEntries({ agencyDescription: description, agencyId: id, from, to, employee }),
      ]);
      return [...timeEntries, ...expenseEntries];
    }),
  );

  const merged = perAgencyResults.flat().sort((a, b) => {
    const dateDiff = new Date(b.billableActivityDate) - new Date(a.billableActivityDate);
    if (dateDiff !== 0) return dateDiff;
    return Number(a.addedToInvoice) - Number(b.addedToInvoice);
  });

  const total = merged.length;
  const offset = page * pageSize;
  const list = merged.slice(offset, offset + pageSize);

  return { list, total };
};
