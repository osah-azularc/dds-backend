import { Op } from "sequelize";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  buildRateBySubTypeRole,
  countTimeEntries,
  countExpenseEntries,
  applyInvoiceDisplayLogic,
  sortByAddedToInvoice,
} from "../../../../helpers/timeexpense/invoicing/billableActivity/billableActivityHelpers.js";
import {
  fetchTimeEntries,
  fetchExpenseEntries,
} from "../../../../helpers/timeexpense/invoicing/billableActivity/billableActivityFetchers.js";

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Billable Activity tab. Lists billable time and
 * expense entries across all agencies, with agency/employee/date filters.
 * Mirrors legacy InvoicesController::getBillableFilterListAction (standalone
 * browse mode only, not the checkbox item-picker mode used inside manual
 * invoice creation). Query-building/row-shaping helpers live in
 * billableActivityHelpers.js - split out purely to stay under the 300-line
 * file guideline; no behavior change.
 */

/**
 * @description
 * Lists billable time + expense entries with pagination. Two things that look
 * like they should match legacy exactly actually diverge in one deliberate,
 * already-justified way - worth spelling out precisely (confirmed live against
 * a running legacy instance, 2026-08-28, checklist item 22's own trap: don't
 * assume a comment that's right about one thing is right about the adjacent
 * one too):
 *   - WHICH ROWS LAND ON WHICH PAGE: legacy's own PHP does a plain
 *     concatenate-then-OFFSET/LIMIT-slice of [times (date desc)][expenses
 *     (date desc)], with NO addedToInvoice consideration at the SQL/slice
 *     level at all. This endpoint's page composition is ALSO type-blocked
 *     (times block, then expenses block - see the timeOffset/timeLimit/
 *     expenseOffset/expenseLimit split below) but additionally orders each
 *     block not-added-first at the DB level (buildAddedToInvoiceSortLiteral,
 *     billableActivityHelpers.js) before slicing - a deliberate, already-
 *     justified improvement (not a bug to fix here) so the picker's
 *     selectable rows surface earlier across the *entire* result set, not
 *     just whatever page a naive slice happens to land on. This means the
 *     literal SET of rows on, say, page 3 can legitimately differ from
 *     legacy's page 3 for the same filters - expected, not a defect.
 *   - DISPLAY ORDER WITHIN a page: a genuine global date-desc sort across
 *     both types, then a stable not-added-first grouping
 *     (sortByAddedToInvoice, billableActivityHelpers.js) - this part DOES
 *     match legacy's own live rendering: on any page whose slice window
 *     straddles the time/expense boundary, legacy's client-side sort visibly
 *     interleaves both types by date within each added/not-added group, it
 *     does not show a type-blocked page.
 * @param {import('express').Request} req
 * - req.query.page (Number, 0-indexed, default 0)
 * - req.query.pageSize (Number, default 10, max 100)
 * - req.query.billDateFrom / billDateTo (String, YYYY-MM-DD) - applied only when both
 * are present
 * - req.query.employee (Number) - judge_assistant_clerk.user_id
 * - req.query.agencyId (Number) - time_entry_billable_agency.id
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: (TimeEntry|ExpenseEntry-shaped row)[], pagination: { page, pageSize, totalCount, totalPages, hasNextPage, hasPreviousPage }, status }
 */
export const getBillableActivityList = async (req, res) => {
  try {
    const {
      page = 0,
      pageSize = 10,
      billDateFrom = "",
      billDateTo = "",
      employee = "",
      agencyId = "",
    } = req.query;

    const pageNumber = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSizeNumber = Math.min(Math.max(1, Number.parseInt(pageSize, 10) || 10), 100);
    const offset = pageNumber * pageSizeNumber;

    const [agency, rateBySubTypeRole] = await Promise.all([
      agencyId
        ? BillableAgency.findByPk(agencyId, { attributes: ["agencyDescription"] })
        : Promise.resolve(null),
      buildRateBySubTypeRole(),
    ]);
    const agencyDescription = agency?.agencyDescription || "";

    const from = billDateFrom && billDateTo ? billDateFrom : "";
    const to = billDateFrom && billDateTo ? billDateTo : "";

    // Count each block first so a requested page can be resolved to a LIMIT/OFFSET window
    // within just one (or the boundary between both) blocks, instead of fetching every
    // matching row to slice a page out of it in memory.
    const [timeCount, expenseCount] = await Promise.all([
      countTimeEntries(from, to, agencyDescription, employee),
      countExpenseEntries(from, to, agencyDescription, employee),
    ]);
    const totalCount = timeCount + expenseCount;

    let timeOffset = 0;
    let timeLimit = 0;
    let expenseOffset = 0;
    let expenseLimit = 0;
    if (offset < timeCount) {
      // Page starts inside the time-entries block; spill into expense entries only if the
      // time-entries block runs out before the page is filled.
      timeOffset = offset;
      timeLimit = Math.min(pageSizeNumber, timeCount - offset);
      expenseLimit = pageSizeNumber - timeLimit;
    } else {
      // Page starts inside (or past) the expense-entries block.
      expenseOffset = offset - timeCount;
      expenseLimit = pageSizeNumber;
    }

    const [timeEntries, expenseEntries] = await Promise.all([
      timeLimit > 0
        ? fetchTimeEntries({
            from,
            to,
            agencyDescription,
            employee,
            rateBySubTypeRole,
            offset: timeOffset,
            limit: timeLimit,
            agencyId,
          })
        : Promise.resolve([]),
      expenseLimit > 0
        ? fetchExpenseEntries({
            from,
            to,
            agencyDescription,
            employee,
            offset: expenseOffset,
            limit: expenseLimit,
            agencyId,
          })
        : Promise.resolve([]),
    ]);

    // Agency codes for the "no agency filter" invoiceNo display branch.
    let agencyCodeById = new Map();
    if (!agencyId) {
      const agencies = await BillableAgency.findAll({ attributes: ["id", "agencyCode"] });
      agencyCodeById = new Map(agencies.map((a) => [a.id, a.agencyCode]));
    }

    applyInvoiceDisplayLogic(timeEntries, agencyId, agencyCodeById);
    applyInvoiceDisplayLogic(expenseEntries, agencyId, agencyCodeById);

    // Time entries block first, then expense entries - both blocks above were already fetched
    // pre-sliced to this page's window, each already ordered not-added-for-this-agency-first
    // then date-desc at the DB level (fetchTimeEntries/fetchExpenseEntries's
    // buildAddedToInvoiceSortLiteral) - that's what makes "selectable rows first" hold across
    // the *entire* filtered result set, not just this one page. sortByAddedToInvoice here is a
    // second, smaller pass: it only needs to re-group the two blocks *across* types (an
    // already-added time entry can otherwise land above a not-yet-added expense entry, since
    // each block is independently ordered) - it does not (and doesn't need to) fix ordering
    // within either block, that's already correct coming out of the DB.
    const data = sortByAddedToInvoice([...timeEntries, ...expenseEntries]);
    const totalPages = Math.ceil(totalCount / pageSizeNumber) || 1;

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages - 1,
        hasPreviousPage: pageNumber > 0,
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching billable activity list:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch billable activity. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Populates the Employee filter on the Billable Activity tab.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ userId, firstName, lastName, userType }], status }
 */
export const getEmployeeList = async (req, res) => {
  try {
    const employees = await JudgeAssistantClerk.findAll({
      where: {
        [Op.or]: [
          { isActive: "1", userType: { [Op.in]: ["judge", "sa", "saalj"] } },
          { isActiveBilling: "1" },
          { isAdministrativePersonnel: "1" },
        ],
      },
      attributes: ["userId", "firstName", "lastName", "userType"],
      order: [["lastName", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: employees,
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching employee list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch employees. Please try again.",
      data: [],
      status: 500,
    });
  }
};
