import { Op } from "sequelize";
import JudgeAssistantClerk from "../../../models/JudgeAssistantClerk.js";
import TimeEntryExpenseType from "../../../models/timeexpense/timeentry/TimeEntryExpenseType.js";
import BillableAgency from "../../../models/timeexpense/invoicing/BillableAgency.js";
import CourtLocations from "../../../models/CourtLocations.js";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * @module
 * @description
 * Reference-data endpoints for the Expense Entry screen's filter dropdowns
 * (Employee, Status, Expense Type, Agency) and the Add/Edit Expense form's
 * dropdowns (those same four, plus Location) - Time & Expense > Expenses page.
 * Ported from osah.repos' TimeExpenseController::getAllTasksAgencyAction,
 * which built all of the Add/Edit Expense form's dropdowns plus these same
 * list filters in one combined response; split into small, independent GET
 * endpoints here instead, matching how this codebase's other already-migrated
 * Time & Expense screens expose reference data (see
 * invoiceReferenceDataController.js / billableActivityController.js's own
 * getEmployeeList). Status isn't fetched here - it's a fixed, computed CASE
 * over expense_entry.is_posted (0-3), not a lookup table, so the frontend
 * defines it as a static constant.
 */

/**
 * Populates the Employee filter. Matches legacy's getUserDetails condition
 * exactly: active judge/SA, OR active-billing, OR administrative personnel -
 * ordered by LastName. (Deliberately judge/SA only, not judge/SA/SAALJ - this
 * mirrors TimeExpenseController's own query, unlike the invoicing module's
 * getProfessionalList/getEmployeeList which port a different legacy
 * controller's broader condition.)
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ userId, firstName, lastName }], status }
 */
export const getEmployeeList = async (req, res) => {
  try {
    const employees = await JudgeAssistantClerk.findAll({
      where: {
        [Op.or]: [
          { isActive: "1", userType: { [Op.in]: ["judge", "sa"] } },
          { isActiveBilling: "1" },
          { isAdministrativePersonnel: "1" },
        ],
      },
      attributes: ["userId", "firstName", "lastName"],
      order: [["lastName", "ASC"]],
    });

    return res.status(200).json({ success: true, data: employees, status: 200 });
  } catch (error) {
    logger.error("Error fetching expense entry employee list:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch employees. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * Populates the Expense Type filter. Legacy's own query only checks
 * task_billable = '1' (no task_billable_active check); also requiring active
 * here (task_billable_active = '1') so a type an admin has since disabled
 * stops showing up as a filterable option - matches the isBillable+isActive
 * gate already used for this same table everywhere else billable expense
 * types are queried (see billableActivityFetchers.js's fetchExpenseEntries).
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ id, expenseType }], status }
 */
export const getExpenseTypeList = async (req, res) => {
  try {
    const expenseTypes = await TimeEntryExpenseType.findAll({
      where: { isBillable: "1", isActive: "1" },
      attributes: ["id", "expenseType"],
      order: [["expenseType", "ASC"]],
    });

    return res.status(200).json({ success: true, data: expenseTypes, status: 200 });
  } catch (error) {
    logger.error("Error fetching expense entry expense type list:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch expense types. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * Populates the Agency filter. Matches legacy's getAgencyDetails condition
 * (active, ordered by agency_code) minus the "AAA" ("All Agencies") row -
 * legacy's own expenseentrycontroller.js filters that row out of this exact
 * list client-side (`agency_code != 'AAA'`) before using it for both this
 * filter and the Add Expense form's agency picker.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ id, agencyDescription, agencyCode }], status }
 */
export const getAgencyList = async (req, res) => {
  try {
    const agencies = await BillableAgency.findAll({
      where: { isActive: "1", agencyCode: { [Op.ne]: "AAA" } },
      attributes: ["id", "agencyDescription", "agencyCode"],
      order: [["agencyCode", "ASC"]],
    });

    return res.status(200).json({ success: true, data: agencies, status: 200 });
  } catch (error) {
    logger.error("Error fetching expense entry agency list:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch agencies. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * Populates the Add/Edit Expense form's Location dropdown. Matches legacy's own
 * courtlocationList_root exactly - the *unfiltered* list (no is_active condition), ordered by
 * Locationname - commancontroller.js populates this root list from every courtlocations row,
 * and expense.phtml's Location <select> ng-repeats over it directly with no filter of its own.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ courtLocationId, locationName }], status }
 */
export const getLocationList = async (req, res) => {
  try {
    const locations = await CourtLocations.findAll({
      attributes: ["courtLocationId", "locationName"],
      order: [["locationName", "ASC"]],
    });

    return res.status(200).json({ success: true, data: locations, status: 200 });
  } catch (error) {
    logger.error("Error fetching expense entry location list:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch locations. Please try again.",
      data: [],
      status: 500,
    });
  }
};
