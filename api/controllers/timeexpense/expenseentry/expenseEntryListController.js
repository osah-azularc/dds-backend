import { Op, literal, fn, col } from "sequelize";
import ExpenseEntry from "../../../models/timeexpense/timeentry/ExpenseEntry.js";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * @module
 * @description
 * Time & Expense > Expenses (Expense Entry) list endpoint. Ported from
 * TimeExpenseController::getAllExpenseEntryAction (osah.repos) - same filters
 * (employee/status/expense-type exact match, agency free-text LIKE match
 * against agency_work_type, date_incurred range) and the same is_deleted='0'
 * base condition/INNER JOIN-to-employee-and-expense-type shape. Also carries
 * over the row-level `str_replace('"', ' ', ...)` legacy applies to
 * agency_work_type_code after the query (its own REPLACE() only strips spaces
 * and brackets, not quotes - confirmed against live data, where a raw
 * agency_work_type_code otherwise comes back as `"BNR-AQ"`).
 *
 * Also runs legacy's second, unpaginated SUM(transaction_amount) query
 * (getAllExpenseDetails_sum) alongside the row query - it's what backs the
 * page's Posted Amount summary tile, over the *entire* filtered set, not just
 * the current page.
 *
 * The one deliberate addition: pagination - legacy returned every matching
 * row in one response with no LIMIT/OFFSET at all.
 */

// Mirrors legacy's getAllExpenseEntryAction posted_status CASE exactly.
const STATUS_LABELS = {
  1: "Posted",
  2: "Invoiced",
  3: "Partially Invoiced",
};
const statusLabel = (isPosted) => STATUS_LABELS[Number(isPosted)] || "Not Posted";

// Every row is required to have a matching employee and expense type - mirrors legacy's
// INNER JOIN judge_assistant_clerk / INNER JOIN time_entry_expense_types (courtlocations stays
// a LEFT JOIN below, same as legacy).
const includeOptions = [
  { association: "employee", attributes: ["firstName", "lastName"], required: true },
  { association: "expenseTypeDetail", attributes: ["expenseType"], required: true },
  { association: "courtLocation", attributes: ["locationName"], required: false },
];

/**
 * @param {import('express').Request} req
 * - req.query.page (Number, 0-indexed, default 0)
 * - req.query.pageSize (Number, default 10, max 100)
 * - req.query.employee (Number) - judge_assistant_clerk.user_id
 * - req.query.status (String, one of '0'-'3') - expense_entry.is_posted
 * - req.query.expenseType (Number) - time_entry_expense_types.id
 * - req.query.agency (String) - LIKE-matched against agency_work_type, same as legacy
 * - req.query.dateFrom / dateTo (String, YYYY-MM-DD) - date_incurred range, applied only when
 *   both are present
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ id, employee, expenseType, status, dateIncurred, transactionAmount, agency, location }], pagination: { page, pageSize, totalCount, totalPages, hasNextPage, hasPreviousPage }, summary: { totalAmount }, status }
 */
export const getExpenseEntryList = async (req, res) => {
  try {
    const {
      page = 0,
      pageSize = 10,
      employee = "",
      status = "",
      expenseType = "",
      agency = "",
      dateFrom = "",
      dateTo = "",
    } = req.query;

    const pageNumber = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSizeNumber = Math.min(Math.max(1, Number.parseInt(pageSize, 10) || 10), 100);
    const offset = pageNumber * pageSizeNumber;

    // Always exclude soft-deleted rows - mirrors legacy's "is_deleted = '0'" base condition.
    const whereCondition = { isDeleted: "0" };

    if (employee !== "" && !Number.isNaN(Number(employee))) {
      whereCondition.userId = Number(employee);
    }
    if (status !== "") {
      whereCondition.isPosted = String(status);
    }
    if (expenseType !== "" && !Number.isNaN(Number(expenseType))) {
      whereCondition.expenseTypeId = Number(expenseType);
    }
    if (agency && agency.trim()) {
      whereCondition.agencyWorkType = { [Op.like]: `%${agency.trim()}%` };
    }
    if (dateFrom && dateTo) {
      whereCondition.dateIncurred = { [Op.between]: [dateFrom, dateTo] };
    }

    const [totalCount, sumRow, rows] = await Promise.all([
      ExpenseEntry.count({ where: whereCondition, include: includeOptions }),
      // Model.sum() (Sequelize's aggregate()) selects its joined includes' PK columns alongside
      // the SUM without a GROUP BY, which MySQL's default only_full_group_by sql_mode rejects
      // outright (confirmed against the live dev DB) - findOne with a single explicit SUM
      // attribute avoids that entirely by never selecting anything non-aggregated.
      ExpenseEntry.findOne({
        where: whereCondition,
        include: includeOptions.map((option) => ({ ...option, attributes: [] })),
        attributes: [[fn("SUM", col("ExpenseEntry.transaction_amount")), "totalAmount"]],
        raw: true,
      }),
      ExpenseEntry.findAll({
        where: whereCondition,
        attributes: [
          "expenseId",
          "isPosted",
          "transactionAmount",
          [
            literal(
              "REPLACE(REPLACE(REPLACE(agency_work_type_code, ' ', ''), '[', ''), ']', '')",
            ),
            "agencyWorkTypeCode",
          ],
          [literal("DATE_FORMAT(date_incurred, '%m-%d-%Y')"), "dateIncurredFormatted"],
        ],
        include: includeOptions,
        order: [["createdDate", "DESC"]],
        limit: pageSizeNumber,
        offset,
      }),
    ]);

    const data = rows.map((row) => {
      const plain = row.toJSON();
      return {
        id: Number(plain.expenseId),
        employee: `${plain.employee?.lastName ?? ""}, ${plain.employee?.firstName ?? ""}`,
        expenseType: plain.expenseTypeDetail?.expenseType ?? null,
        status: statusLabel(plain.isPosted),
        dateIncurred: plain.dateIncurredFormatted,
        transactionAmount: plain.transactionAmount === null ? 0 : Number(plain.transactionAmount),
        // Matches legacy's post-query `str_replace('"', ' ', ...)` - the REPLACE() above only
        // strips spaces/brackets, not the double quotes each code is stored wrapped in.
        agency: plain.agencyWorkTypeCode ? plain.agencyWorkTypeCode.replace(/"/g, " ") : null,
        location: plain.courtLocation?.locationName ?? null,
      };
    });

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
      summary: { totalAmount: sumRow?.totalAmount === null ? 0 : Number(sumRow?.totalAmount) || 0 },
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching expense entry list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch expenses. Please try again.",
      data: [],
      status: 500,
    });
  }
};
