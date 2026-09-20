import ExpenseEntry from "../../../models/timeexpense/timeentry/ExpenseEntry.js";
import { logger } from "../../../../config/winstonLogger.js";

const MIN_EXPENSE_ID = 10000000;
const MAX_EXPENSE_ID = 999999999;

// Matches legacy's `random_int(10000000, 999999999)` exactly - the same naive, no-collision-
// check id generation (990M possible values; legacy never guarded against a repeat either).
const generateExpenseId = () =>
  Math.floor(Math.random() * (MAX_EXPENSE_ID - MIN_EXPENSE_ID + 1)) + MIN_EXPENSE_ID;

// Legacy stores date_incurred by reparsing the MM-DD-YYYY input through PHP's strtotime after
// swapping dashes for slashes (so it's read as M/D/Y, not Y/M/D) - same reinterpretation here,
// via a plain split rather than a date-library parse (the input is already validated MM-DD-YYYY
// by expenseEntrySaveBodySchema's dateStringSchema).
const toIsoDate = (mmddyyyy) => {
  if (!mmddyyyy) return null;
  const [month, day, year] = mmddyyyy.split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

/**
 * @module
 * @description
 * Time & Expense > Expenses (Expense Entry) create/update endpoint - the New/Edit Expense
 * modal's Post button. Ported from osah.repos' addExpenseEntryAction/editExpenseentryFormAction,
 * combined into one endpoint keyed on expenseId's presence, matching this project's own
 * established single-save-endpoint convention (see billableAgencyHelper.js's saveBillableAgency).
 *
 * Trusts the client-computed roundedAmount/differenceAmount/totalRoundedAmount exactly like
 * legacy does - both PHP actions take rounded_amount/difference_amount/total_rounded_amount
 * straight off the request rather than recomputing the agency-count split server-side (the split
 * math itself, equalSplitIndividualExpense, is ported to the frontend's useExpenseEntryForm).
 *
 * is_posted/is_deleted are left to the column defaults on create (matching legacy, which never
 * sets either) and untouched on update (legacy's own UPDATE data array omits both too).
 */

/**
 * @param {import('express').Request} req - req.body: { expenseId?, user, task, agency,
 * agencyCode?, agencies?, dateIncurred?, location?, amount, description?, roundedAmount,
 * differenceAmount, totalRoundedAmount }. req.user - the authenticated JudgeAssistantClerk row
 * (from validatePermission) - its userId becomes created_by/updated_by, matching legacy's own
 * session->loguser['user_id'].
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { expenseId }, status }
 */
export const saveExpenseEntry = async (req, res) => {
  try {
    const {
      expenseId,
      user,
      task,
      agency,
      agencyCode,
      agencies,
      dateIncurred,
      location,
      amount,
      description,
      roundedAmount,
      differenceAmount,
      totalRoundedAmount,
    } = req.body;

    const data = {
      userId: user,
      expenseTypeId: task,
      agencies: agencies && agencies.length ? JSON.stringify(agencies) : null,
      agencyWorkType: JSON.stringify(agency),
      agencyWorkTypeCode: agencyCode && agencyCode.length ? JSON.stringify(agencyCode) : null,
      dateIncurred: toIsoDate(dateIncurred),
      transactionAmount: amount,
      roundedAmount,
      differenceAmount,
      location: location || null,
      description: description || null,
      updatedDate: new Date(),
      updatedBy: req.user.userId,
      totalRoundedAmount,
    };

    if (expenseId) {
      const [updatedCount] = await ExpenseEntry.update(data, {
        where: { expenseId, isDeleted: "0" },
      });

      if (!updatedCount) {
        return res.status(404).json({
          success: false,
          message: "Expense entry not found.",
          data: null,
          status: 404,
        });
      }

      return res.status(200).json({
        success: true,
        data: { expenseId: Number(expenseId) },
        status: 200,
      });
    }

    const newExpenseId = generateExpenseId();
    await ExpenseEntry.create({
      ...data,
      expenseId: newExpenseId,
      createdDate: new Date(),
      createdBy: req.user.userId,
    });

    return res.status(200).json({
      success: true,
      data: { expenseId: newExpenseId },
      status: 200,
    });
  } catch (error) {
    logger.error("Error saving expense entry:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to save expense entry. Please try again.",
      data: null,
      status: 500,
    });
  }
};
