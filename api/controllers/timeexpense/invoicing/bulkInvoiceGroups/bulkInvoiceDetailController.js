import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import BulkInvoiceSummary from "../../../../models/timeexpense/invoicing/BulkInvoiceSummary.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { fetchGroupBillableActivity } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGroupBillableActivityHelpers.js";
import { loadBulkInvoiceGroupInvoices } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGroupInvoicesHelpers.js";
import { normalizeStoredSummaryPayload } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGroupSummaryHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Time & Expense > Invoicing > Bulk Invoice Groups > group-detail screens
 * (Summary/Billable Activity/Invoices tabs for an *already-created* group -
 * the Create-form's own preview/save-draft flow lives in
 * bulkInvoiceCreateController.js). Ported from BulkinvoicesController::
 * viewSummaryAction/getBulkInvoiceGroupBillableActivityAction/
 * getBulkInvoiceDetailsAction. Read-only pass only - Generate Invoices/Send
 * Invoices/Assign Case Referrals are a separate, later pass (see migration doc).
 */

/**
 * @description
 * Summary tab for an already-saved group - re-serves the stored inv_summary_data
 * JSON blob, matching legacy's viewSummaryAction exactly (no recomputation),
 * normalized to this app's own camelCase preview shape (see
 * bulkInvoiceGroupSummaryHelpers.js's own comment on why a legacy-created row
 * needs that translation and a new-app-created one doesn't).
 * @param {import('express').Request} req - req.params.id - bulk_invoices.bulkInvoiceId (the group's own business-key id, matching legacy's `bulk_inv_grp =` lookup - not bulk_invoices.id).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: <normalized preview payload> & { groupPk }, status } - 404 if nothing's been saved yet for this id. groupPk (bulk_invoices.id, the real PK) is added on top of the stored payload - the Delete Draft endpoint takes the PK, not this business-key id, and the two aren't guaranteed equal for a legacy-created row (see bulkInvoiceCreateController.js's own deviation note).
 */
export const getBulkInvoiceGroupSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const [summaryRow, group] = await Promise.all([
      BulkInvoiceSummary.findOne({ where: { bulkInvGrp: id }, order: [["id", "DESC"]] }),
      BulkInvoice.findOne({ where: { bulkInvoiceId: id }, attributes: ["id"] }),
    ]);

    if (!summaryRow?.invSummaryData) {
      return res.status(404).json({ success: false, message: "Bulk invoice group summary not found", status: 404 });
    }

    const data = {
      ...normalizeStoredSummaryPayload(JSON.parse(summaryRow.invSummaryData)),
      groupPk: group?.id || null,
    };
    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching bulk invoice group summary:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch the bulk invoice group summary. Please try again.",
      status: 500,
    });
  }
};

/**
 * @description
 * Billable Activity tab - every time/expense entry across the group's own pulled
 * agencies (or just one, via the Agency filter), already-invoiced entries
 * included. Stateless like legacy's own call (driven entirely by the
 * timeExpenseEntries/date-range the client already has in memory from the
 * Summary load - see bulkInvoiceGroupBillableActivityHelpers.js's own comment),
 * not looked up by a stored group id - works identically whether the group has
 * been saved yet or not, matching legacy's own $rootScope-driven behavior.
 * @param {import('express').Request} req - req.body.timeExpenseEntries (Object, keyed by agency description - the group's own agency map, same shape the Summary payload's own field of that name has). req.body.billDateFrom / billDateTo (String, YYYY-MM-DD) - defaulted from the group's own dates unless the Filter panel overrides them. req.body.agencyId / employee (Number, optional). req.body.page / pageSize (Number).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: <row>[], pagination: { page, pageSize, totalCount, totalPages, hasNextPage, hasPreviousPage }, status } - same list/pagination response shape every other list endpoint in this module uses (matches useServerPaginatedList's own contract, e.g. bulkInvoiceController.js::getBulkInvoiceList).
 */
export const getBulkInvoiceGroupBillableActivity = async (req, res) => {
  try {
    const {
      timeExpenseEntries = {},
      billDateFrom = "",
      billDateTo = "",
      agencyId = "",
      employee = "",
      page = 0,
      pageSize = 50,
    } = req.body;

    const allAgencies = Object.entries(timeExpenseEntries).map(([description, entry]) => ({
      description,
      id: entry?.agencyId,
    }));
    const agencies = agencyId
      ? allAgencies.filter((agency) => String(agency.id) === String(agencyId))
      : allAgencies;

    const pageNumber = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSizeNumber = Math.min(Math.max(1, Number.parseInt(pageSize, 10) || 50), 500);

    const { list, total } = await fetchGroupBillableActivity({
      agencies,
      from: billDateFrom,
      to: billDateTo,
      employee: employee || "",
      page: pageNumber,
      pageSize: pageSizeNumber,
    });

    const totalPages = Math.ceil(total / pageSizeNumber) || 1;
    return res.status(200).json({
      success: true,
      data: list,
      pagination: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalCount: total,
        totalPages,
        hasNextPage: pageNumber < totalPages - 1,
        hasPreviousPage: pageNumber > 0,
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching bulk invoice group billable activity:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch billable activity for this bulk invoice group. Please try again.",
      status: 500,
    });
  }
};

/**
 * @description
 * Invoices tab - see bulkInvoiceGroupInvoicesHelpers.js for the actual query +
 * rounding-correction write.
 * @param {import('express').Request} req - req.params.id - bulk_invoices.bulkInvoiceId.
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: <see loadBulkInvoiceGroupInvoices's own return comment>, status } - 404 if the group has no bulk_invoices row (never went through Generate Invoices, or the id doesn't exist).
 */
export const getBulkInvoiceGroupInvoices = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadBulkInvoiceGroupInvoices(Number(id));

    if (!data) {
      return res.status(404).json({ success: false, message: "Bulk invoice group not found", status: 404 });
    }

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching bulk invoice group invoices:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoices for this bulk invoice group. Please try again.",
      status: 500,
    });
  }
};
