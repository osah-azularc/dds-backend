import { literal } from "sequelize";
import ExpenseEntry from "../../../models/timeexpense/timeentry/ExpenseEntry.js";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * @module
 * @description
 * Time & Expense > Expenses (Expense Entry) single-record endpoint - populates the Edit/View
 * Expense modal. Ported from TimeExpenseController::getExpenseEntryByIdAction (osah.repos):
 * same is_deleted='0' + expense_id match, same INNER JOIN-to-employee-and-expense-type/LEFT
 * JOIN-to-courtlocations shape as the list endpoint (see expenseEntryListController.js -
 * includeOptions is duplicated here rather than shared, matching this project's existing
 * per-file convention for small option objects), same `order by created_date desc` (legacy
 * takes the first row of that ordering rather than assuming expense_id is unique - carried
 * over here even though it always is in practice).
 *
 * Legacy's own response also included judge_assistant_clerk.FirstName/LastName - not of the
 * expense's owner, but resolved via a *second*, separate request (getUserDetailsById(created_by))
 * purely to render the modal's "Created By" line. That second endpoint doesn't exist in this
 * codebase yet and is out of scope here; the modal instead labels the assigned employee (the one
 * this endpoint does return) as "Created By" - already how the pre-existing mock version of this
 * modal read that field, so this isn't a new inconsistency.
 *
 * One shape change from legacy: `agency_work_type` is parsed from its stored JSON-array string
 * (e.g. `["DHS-SNAP","Department of Education"]`) into a real array server-side, rather than
 * making the frontend do the equivalent `JSON.parse(...)` legacy's own controller did.
 */

const includeOptions = [
  { association: "employee", attributes: ["firstName", "lastName"], required: true },
  { association: "expenseTypeDetail", attributes: ["expenseType"], required: true },
  { association: "courtLocation", attributes: ["locationName"], required: false },
];

const parseAgencyWorkType = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * @param {import('express').Request} req - req.params.expenseId - expense_entry.expense_id
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { expenseId, expenseTypeId, expenseType, userId, createdBy, updatedBy, firstName, lastName, dateIncurred, location, courtLocation, agencyWorkType, agencies, transactionAmount, differenceAmount, roundedAmount, totalRoundedAmount, description }, status }
 */
export const getExpenseEntryById = async (req, res) => {
  try {
    const { expenseId } = req.params;

    const row = await ExpenseEntry.findOne({
      where: { expenseId: Number(expenseId), isDeleted: "0" },
      attributes: [
        "expenseId",
        "expenseTypeId",
        "userId",
        "createdBy",
        "updatedBy",
        "location",
        "agencyWorkType",
        "agencies",
        "transactionAmount",
        "differenceAmount",
        "roundedAmount",
        "totalRoundedAmount",
        "description",
        [literal("DATE_FORMAT(date_incurred, '%m-%d-%Y')"), "dateIncurredFormatted"],
      ],
      include: includeOptions,
      order: [["createdDate", "DESC"]],
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Expense entry not found.",
        data: null,
        status: 404,
      });
    }

    const plain = row.toJSON();
    const data = {
      expenseId: Number(plain.expenseId),
      expenseTypeId: plain.expenseTypeId,
      expenseType: plain.expenseTypeDetail?.expenseType ?? null,
      userId: plain.userId,
      createdBy: plain.createdBy,
      updatedBy: plain.updatedBy,
      firstName: plain.employee?.firstName ?? null,
      lastName: plain.employee?.lastName ?? null,
      dateIncurred: plain.dateIncurredFormatted,
      location: plain.location,
      courtLocation: plain.courtLocation?.locationName ?? null,
      agencyWorkType: parseAgencyWorkType(plain.agencyWorkType),
      agencies: plain.agencies,
      transactionAmount: plain.transactionAmount === null ? null : Number(plain.transactionAmount),
      differenceAmount: plain.differenceAmount === null ? null : Number(plain.differenceAmount),
      roundedAmount: plain.roundedAmount === null ? null : Number(plain.roundedAmount),
      totalRoundedAmount:
        plain.totalRoundedAmount === null ? null : Number(plain.totalRoundedAmount),
      description: plain.description,
    };

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching expense entry by id:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch expense entry. Please try again.",
      data: null,
      status: 500,
    });
  }
};
