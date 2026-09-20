import { Op } from "sequelize";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import TimeEntry from "../../../../models/timeexpense/timeentry/TimeEntry.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { deleteInvoiceRecord } from "../invoices/invoiceActionsController.js";

// Whitelist of client-facing sort keys -> Sequelize model attribute names (see
// invoiceController.js's ALLOWED_ORDER_COLUMNS for the same pattern). Only Created Date has any
// legacy precedent (the one clickable <th> in bulkInvoicesList.phtml), alongside the real
// default (id).
const ALLOWED_ORDER_COLUMNS = {
  id: "id",
  createdAt: "createdAt",
};

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Bulk Invoice Groups tab: list bulk invoice
 * groups with search, status/date-range filters, sorting and pagination.
 * @param {import('express').Request} req
 * - req.query.page (Number, 0-indexed, default 0)
 * - req.query.pageSize (Number, default 10, max 100)
 * - req.query.search (String) - matches against groupId
 * - req.query.status (String, "1" | "2" | "3")
 * - req.query.createdDateFrom / createdDateTo (String, YYYY-MM-DD)
 * - req.query.orderby (String, one of ALLOWED_ORDER_COLUMNS, default id)
 * - req.query.order ("asc" | "desc", default desc)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: (BulkInvoice & { creatorName })[], pagination: { page, pageSize, totalCount, totalPages, hasNextPage, hasPreviousPage }, status }
 */
export const getBulkInvoiceList = async (req, res) => {
  try {
    const {
      page = 0,
      pageSize = 10,
      search = "",
      status = "",
      createdDateFrom = "",
      createdDateTo = "",
      orderby = "id",
      order = "desc",
    } = req.query;

    const pageNumber = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSizeNumber = Math.min(Math.max(1, Number.parseInt(pageSize, 10) || 10), 100);
    const offset = pageNumber * pageSizeNumber;
    const orderDirection = order.toString().toUpperCase() === "ASC" ? "ASC" : "DESC";
    const orderColumn = ALLOWED_ORDER_COLUMNS[orderby] || "id";

    // Always exclude soft-deleted groups - mirrors legacy's "bk.status != '0'" base condition.
    const whereCondition = ["1", "2", "3"].includes(String(status))
      ? { status: String(status) }
      : { status: { [Op.ne]: "0" } };

    if (search && typeof search === "string" && search.trim()) {
      whereCondition.groupId = { [Op.like]: `%${search.trim()}%` };
    }

    if (createdDateFrom && createdDateTo) {
      whereCondition.createdAt = { [Op.between]: [createdDateFrom, createdDateTo] };
    }

    const totalCount = await BulkInvoice.count({ where: whereCondition });

    const groups = await BulkInvoice.findAll({
      where: whereCondition,
      order: [[orderColumn, orderDirection]],
      limit: pageSizeNumber,
      offset,
      include: [
        {
          model: JudgeAssistantClerk,
          as: "creator",
          attributes: ["firstName", "lastName"],
          required: false,
        },
      ],
    });

    const data = groups.map((group) => {
      const plain = group.toJSON();
      return {
        ...plain,
        creatorFirstName: plain.creator?.firstName || null,
        creatorLastName: plain.creator?.lastName || null,
        creator: undefined,
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
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching bulk invoice list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch bulk invoice groups. Please try again.",
      data: [],
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 20-08-2026
 * @description
 * Time & Expense > Invoicing > Bulk Invoice Groups tab: Delete Draft. Ported from
 * BulkinvoicesController::deleteBulkInvoiceAction (osah.repos) - confirmed via
 * module.config.php's `bulkinvoices` route as the actually-live implementation,
 * not InvoicesController.php's own same-named dead-code duplicate (never reached
 * by any factory call, and uses incompatible field semantics).
 *
 * Legacy's own WHERE clause has a real, confirmed bug: it updates
 * `bulk_invoices SET status=0 WHERE bulk_invoice_id = data.id` - matching the
 * group's own `id` (PK) value against its *different* `bulk_invoice_id` column
 * (see BulkInvoice.js's own field comment - they're genuinely not the same value).
 * That's a raw-SQL field swap, not a business rule, so it's not reproduced here -
 * this matches on the model's real PK (`findByPk`) instead.
 *
 * Cascade, matching legacy's three real effects:
 * 1. Soft-delete every child `invoices` row (bulk_inv_grp = this group's
 * bulkInvoiceId) - reuses deleteInvoiceRecord (invoiceActionsController.js)
 * per invoice rather than re-deriving legacy's separate deleteEachInvoice,
 * since it's the same "soft-delete + unlink billable items" effect already
 * proven for the Invoices tab's own Delete - with one confirmed difference
 * passed via `{ stampModified: true }`: BulkinvoicesController::deleteEachInvoice
 * (the real legacy cascade behind this route) stamps modified_by/modified_date
 * on the invoices row, unlike InvoicesController::deleteInvoiceAction (the
 * single-invoice Delete this same helper also serves), which never does. Read
 * both legacy actions directly rather than assuming one covers the other.
 * 2. Soft-delete the bulk_invoices row itself (status 0).
 * 3. Release every AAA time_entry tagged with this group's `B00012`-style code
 * (added_for_agencies) back to unbilled (added_for_agencies='',
 * added_to_invoice=0) - legacy's updateAAAEntriesFlag, exact-match on the
 * computed code (not a CSV/LIKE match - confirmed from the legacy SQL).
 *
 * Deliberate difference from legacy: legacy's deleteEachInvoice has no per-invoice
 * status guard and silently cascades regardless of outcome. deleteInvoiceRecord
 * enforces Draft-only (an existing, already-shipped restriction - see its own
 * comment). Confirmed reachable in practice (2026-08-26, Bulk Invoicing Send
 * Invoices analysis) - not just a theoretical edge case: the group's own status
 * only flips to fully-sent once every invoice sends successfully, so a partially-
 * failed Send Invoices (or a bulk-linked invoice independently marked Paid/Sent/
 * Written-off from the regular Invoice List - nothing prevents that) leaves the
 * group still showing as Draft while this guard blocks the whole delete. When that
 * happens, the whole group delete is aborted and rolled back inside one
 * transaction rather than partially cascading - safer than legacy's fire-and-
 * forget - and returns a clear group-level explanation rather than
 * deleteInvoiceRecord's own generic per-invoice message (see the loop below).
 * @param {import('express').Request} req - req.params.id - bulk_invoices.id (PK)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id }, status }
 */
export const deleteBulkInvoiceGroup = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const group = await BulkInvoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!group) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Bulk invoice group not found", status: 404 });
    }
    // Matches bulkInvoiceListColumns.jsx's own canDelete guard (status !== '1') - the list UI
    // only ever offers this action for a Draft (2 or 3) group.
    if (group.status === "1") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Only Draft bulk invoice groups can be deleted.",
        status: 400,
      });
    }

    if (group.bulkInvoiceId) {
      // isDeleted: 0 - confirmed live (2026-08-20) that legacy's own cascade query has no such
      // filter and will happily re-run deleteEachInvoice against an already-deleted invoice in
      // the group (harmless - is_deleted just gets set to 1 again, findAll's own isDeleted: 0
      // filter means no items/unlink work actually re-runs), but it does leave a spurious
      // duplicate "Invoice Deleted" inv_logs row behind. Filtering here avoids that noise; not a
      // business-rule change since a deleted invoice's own real data never differs either way.
      const childInvoices = await Invoice.findAll({
        where: { bulkInvGrp: group.bulkInvoiceId, isDeleted: 0 },
        transaction,
      });

      for (const invoice of childInvoices) {
        // Sequential, not Promise.all - each call takes a row lock on `invoices` and shares one
        // transaction; awaiting in series avoids lock-ordering surprises across the loop.
        const result = await deleteInvoiceRecord(invoice.id, transaction, req.user.userId, {
          stampModified: true,
        });
        if (!result.ok) {
          await transaction.rollback();
          // Confirmed reachable (2026-08-26, not hypothetical): the group's own status only
          // flips to fully-sent (1) once EVERY invoice sends successfully, so a partially-failed
          // Send Invoices - or a bulk-linked invoice independently marked Paid/Sent/Written-off
          // from the regular Invoice List, nothing prevents that - leaves the group still showing
          // as Draft while this per-invoice Draft-only guard silently blocks the whole delete.
          // deleteInvoiceRecord's own generic "Only Draft invoices can be deleted" message (named
          // to one arbitrary child invoice) doesn't explain that real cause - this does.
          const message =
            result.status === 400
              ? "This bulk invoice group can't be deleted because one or more of its invoices have already been sent or otherwise finalized. Only groups where every invoice is still in Draft can be deleted."
              : `Unable to delete invoice ${invoice.invNo || invoice.id}: ${result.message}`;
          return res.status(result.status).json({ success: false, message, status: result.status });
        }
      }
    }

    await group.update(
      { status: "0", modifiedBy: req.user.userId, modifiedAt: new Date() },
      { transaction },
    );

    if (group.bulkInvoiceId) {
      const bulkGrpNo = `B${String(group.bulkInvoiceId).padStart(5, "0")}`;
      await TimeEntry.update(
        { addedForAgencies: "", addedToInvoice: 0 },
        { where: { addedForAgencies: bulkGrpNo }, transaction },
      );
    }

    await transaction.commit();
    return res.status(200).json({ success: true, data: { id: group.id }, status: 200 });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error deleting bulk invoice group:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to delete bulk invoice group. Please try again.",
      status: 500,
    });
  }
};
