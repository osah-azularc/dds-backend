import { Op } from "sequelize";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import TimeEntryBillingRole from "../../../../models/timeexpense/timeentry/TimeEntryBillingRole.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { getItemCatalog, getProfessionalRate } from "../../../../helpers/timeexpense/invoicing/shared/itemCatalogHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing - the small, unpaginated reference-data endpoints
 * that populate the Invoices tab / manual invoice form's filter and dropdown
 * lists (Agency, Item Catalog, Professional, Role, per-professional Rate).
 * Split out of invoiceController.js (2026-08-27) purely to stay under the
 * 300-line file guideline - no behavior change. getInvoiceList (the one actual
 * paginated list endpoint this module owns) stays in invoiceController.js.
 */

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Populates the Agency filter/picker on the Invoices tab. Small, unpaginated
 * reference list (a handful to dozens of agencies) - not the same resource as
 * getInvoiceList, so it isn't reusing that endpoint's `all` escape hatch, it's
 * just never paginated to begin with, matching how legacy populated this
 * dropdown (agencyList, ng-repeat, no pagination in invoices.phtml). Sorted by
 * agency_code, not description - matches legacy's own query exactly
 * (TimeExpenseController::getBillableAgencyListAction's condition param:
 * `time_entry_billable_agency_active = "1" order by agency_code`).
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ id, agencyDescription, agencyCode }], status }
 */
export const getAgencyList = async (req, res) => {
  try {
    const agencies = await BillableAgency.findAll({
      where: { isActive: "1" },
      attributes: ["id", "agencyDescription", "agencyCode", "email", "emailTwo", "emailThree"],
      order: [["agencyCode", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: agencies,
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching billable agency list:", {
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
 * @author Rizwan Hiroli
 * @date 2026-08-18
 * @description
 * Populates the manual invoice Item dropdown's catalog-sourced options (every
 * active time_entry_tasks/time_entry_expense_types row, in legacy's own order -
 * see itemCatalogHelpers.js). "Case Referral Fee" itself isn't part of this
 * response - it's not in either catalog table, the frontend adds it as a fixed
 * first option the same way createinvoicemanual.phtml/editinvoice.phtml
 * hardcode it as a literal <option>, not an ng-repeat.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ code, type, description, isAAA }], status }
 */
export const getItemCatalogList = async (req, res) => {
  try {
    const data = await getItemCatalog();
    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching invoice item catalog:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch item catalog. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-18
 * @description
 * Populates the Professional dropdown shown on a catalog (time/expense) line
 * item - ported from InvoicesController::getProfessionListAction's condition
 * exactly (active judge/SA/SAALJ, OR active-billing, OR administrative
 * personnel), ORDER BY LastName.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ userId, firstName, lastName }], status }
 */
export const getProfessionalList = async (req, res) => {
  try {
    const professionals = await JudgeAssistantClerk.findAll({
      where: {
        [Op.or]: [
          { isActive: "1", userType: { [Op.in]: ["judge", "sa", "saalj"] } },
          { isActiveBilling: "1" },
          { isAdministrativePersonnel: "1" },
        ],
      },
      attributes: ["userId", "firstName", "lastName"],
      order: [["lastName", "ASC"]],
    });

    return res.status(200).json({ success: true, data: professionals, status: 200 });
  } catch (error) {
    logger.error("Error fetching professional list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch professionals. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-18
 * @description
 * Populates the Role dropdown shown instead of Professional on an AAA
 * ("All Agencies - Administrative") time line item - ported from
 * InvoicesController::getRoleListAction (time_entry_billing_roles where
 * billable_access = '1'). subTypeRole is upper-cased here (legacy's own
 * `UPPER(sub_type_role)`), a display-only transform.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: [{ id, ratePerHour, subTypeRole }], status }
 */
export const getRoleList = async (req, res) => {
  try {
    const roles = await TimeEntryBillingRole.findAll({
      where: { billableAccess: "1" },
      attributes: ["id", "ratePerHour", "subTypeRole"],
    });

    const data = roles.map((role) => ({
      id: role.id,
      ratePerHour: role.ratePerHour === null ? null : Number(role.ratePerHour),
      subTypeRole: (role.subTypeRole || "").toUpperCase(),
    }));

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching role list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch roles. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-18
 * @description
 * Rate auto-fill when a Professional is selected on a catalog (time/expense)
 * line item - ported from InvoicesController::getProfessionDetailsAction.
 * Quantity is never auto-filled (legacy doesn't either - it's always typed in
 * manually for a non-billable-activity-sourced line item), only rate.
 * @param {import('express').Request} req - req.params.id - judge_assistant_clerk.user_id
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { rate }, status } - rate is null when no matching role/rate is found (mirrors legacy's own empty-result case, not an error).
 */
export const getProfessionalRateDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const rate = await getProfessionalRate(id);

    return res.status(200).json({ success: true, data: { rate }, status: 200 });
  } catch (error) {
    logger.error("Error fetching professional rate:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch professional rate. Please try again.",
      data: null,
      status: 500,
    });
  }
};
