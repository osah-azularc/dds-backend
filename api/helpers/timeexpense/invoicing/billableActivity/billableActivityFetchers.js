import { Op, literal } from "sequelize";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import ExpenseEntry from "../../../../models/timeexpense/timeentry/ExpenseEntry.js";
import TimeEntryTask from "../../../../models/timeexpense/timeentry/TimeEntryTask.js";
import TimeEntryExpenseType from "../../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import { buildAgencyOrAaaLiteral, buildAddedToInvoiceSortLiteral } from "./billableActivityHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * The two row-fetching queries (fetchTimeEntries/fetchExpenseEntries) for
 * billableActivityController's getBillableActivityList and
 * bulkInvoiceGenerateHelpers.js's own AAA time-entry resolution. Split out of
 * billableActivityHelpers.js (2026-08-27) purely to stay under the 300-line
 * file guideline; no behavior change - the query-literal builders/count
 * queries/row post-processing helpers those two functions call stay in that
 * file and are imported back here.
 */

// Fetches one page of billable time entries matching the given filters - not-yet-added-for-
// this-agency rows first (see buildAddedToInvoiceSortLiteral), then date desc, ties broken by
// id desc so paging stays stable across requests.
export const fetchTimeEntries = async ({
  from,
  to,
  agencyDescription,
  employee,
  rateBySubTypeRole,
  offset,
  limit,
  agencyId,
}) => {
  const rows = await TimeEntry.findAll({
    attributes: [
      "id",
      "userId",
      "timeTrackingDateEntry",
      [literal("ROUND(TIME_TO_SEC(split_time_btwn_agency) / 3600, 2)"), "quantity"],
      "createdDate",
      "task",
      "addedToInvoice",
      "invoiceNo",
      "invoiceId",
      "addedForAgencies",
      [
        literal("REPLACE(REPLACE(REPLACE(agency_work_type_code, ' ', ''), '[', ''), ']', '')"),
        "agencyWorkTypeCode",
      ],
    ],
    include: [
      {
        model: TimeEntryTask,
        as: "taskDetail",
        // "id" explicit, not relying on Sequelize's own default PK inclusion - matches
        // resolveBillableItemDetails's own explicit style (billableLinkageHelpers.js) and this
        // file's own fetchExpenseEntries below.
        attributes: ["id", "taskName"],
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
      [Op.and]: [buildAgencyOrAaaLiteral(agencyDescription)],
    },
    order: [
      [buildAddedToInvoiceSortLiteral(agencyId), "ASC"],
      ["timeTrackingDateEntry", "DESC"],
      ["id", "DESC"],
    ],
    offset,
    limit,
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    const subTypeRole = plain.employee?.subTypeRole;
    return {
      id: plain.id,
      professional: plain.userId,
      timeDate: plain.timeTrackingDateEntry,
      quantity: Number(plain.quantity),
      createdDate: plain.createdDate,
      task: plain.task,
      addedToInvoice: plain.addedToInvoice,
      invoiceNo: plain.invoiceNo,
      invoiceId: plain.invoiceId,
      addedForAgencies: plain.addedForAgencies,
      jacUserId: plain.employee?.userId ?? null,
      firstName: plain.employee?.firstName ?? null,
      lastName: plain.employee?.lastName ?? null,
      taskName: plain.taskDetail?.taskName ?? null,
      taskId: plain.taskDetail?.id ?? null,
      rate: subTypeRole ? rateBySubTypeRole.get(subTypeRole) : null,
      type: "time",
      agencyWorkTypeCode: plain.agencyWorkTypeCode,
      billableActivityDate: plain.timeTrackingDateEntry,
    };
  });
};

// Fetches one page of billable expense entries matching the given filters - see fetchTimeEntries.
export const fetchExpenseEntries = async ({
  from,
  to,
  agencyDescription,
  employee,
  offset,
  limit,
  agencyId,
}) => {
  const rows = await ExpenseEntry.findAll({
    attributes: [
      "id",
      "expenseId",
      "userId",
      "roundedAmount",
      "dateIncurred",
      "createdDate",
      "addedToInvoice",
      "invoiceNo",
      "invoiceId",
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
        // "id" explicit (not relying on Sequelize's own default PK inclusion) - matches
        // resolveBillableItemDetails's own explicit style (billableLinkageHelpers.js). Needed by
        // bulkInvoiceGenerateHelpers.js's own taskId resolution below (invoice_items.task_id must
        // be the catalog id, not this expense_entry's own id - see resolveBillableItemDetails's
        // own doc comment for why).
        attributes: ["id", "expenseType"],
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
      [Op.and]: [buildAgencyOrAaaLiteral(agencyDescription)],
    },
    order: [
      [buildAddedToInvoiceSortLiteral(agencyId), "ASC"],
      ["dateIncurred", "DESC"],
      ["id", "DESC"],
    ],
    offset,
    limit,
  });

  return rows.map((row) => {
    const plain = row.toJSON();
    return {
      id: plain.id,
      expense: plain.id,
      expenseId: plain.expenseId,
      professional: plain.userId,
      totalAmount: plain.roundedAmount,
      dateIncurred: plain.dateIncurred,
      createdDate: plain.createdDate,
      addedToInvoice: plain.addedToInvoice,
      invoiceNo: plain.invoiceNo,
      invoiceId: plain.invoiceId,
      addedForAgencies: plain.addedForAgencies,
      jacUserId: plain.employee?.userId ?? null,
      firstName: plain.employee?.firstName ?? null,
      lastName: plain.employee?.lastName ?? null,
      expenseTypesNames: plain.expenseTypeDetail?.expenseType ?? null,
      // Added for bulkInvoiceGenerateHelpers.js - no existing caller read this field before, so
      // adding it here is additive-only (matches resolveBillableItemDetails's own taskId
      // resolution exactly: the catalog id when resolvable, this row's own id otherwise).
      taskId: plain.expenseTypeDetail?.id ?? plain.id,
      type: "expense",
      agencyWorkTypeCode: plain.agencyWorkTypeCode,
      billableActivityDate: plain.dateIncurred,
    };
  });
};
