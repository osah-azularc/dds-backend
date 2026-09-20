import ExpenseEntry from "../../../models/timeexpense/timeentry/ExpenseEntry.js";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * @module
 * @description
 * Time & Expense > Expenses (Expense Entry) delete endpoint - the row action menu's Delete item
 * + its confirmation dialog. Ported from osah.repos' deleteExpenseEntryByIdAction: a soft
 * delete, `UPDATE expense_entry SET is_deleted = '1' WHERE expense_id = ?` - no other columns
 * touched, no hard delete.
 *
 * Legacy's own is_posted == '1' ("Posted") gate on this action is UI-only - expenseentry.phtml's
 * Delete link is wrapped in `ng-if="expense.is_posted == '1'"`, but deleteExpenseEntryByIdAction
 * itself never checks is_posted before soft-deleting. Matched as-is here (not enforced
 * server-side) - the frontend row menu applies the same status check before offering Delete at
 * all.
 */

/**
 * @param {import('express').Request} req - req.params.expenseId - expense_entry.expense_id
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { expenseId }, status }
 */
export const deleteExpenseEntryById = async (req, res) => {
  try {
    const { expenseId } = req.params;

    const [updatedCount] = await ExpenseEntry.update(
      { isDeleted: "1" },
      { where: { expenseId, isDeleted: "0" } },
    );

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
  } catch (error) {
    logger.error("Error deleting expense entry:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to delete expense entry. Please try again.",
      data: null,
      status: 500,
    });
  }
};
