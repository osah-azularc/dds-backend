import { Op, fn, col } from "sequelize";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import { logger } from "../../../../../config/winstonLogger.js";

// Invoice.belongsTo(BillableAgency, { as: "billableAgency" }) - declared centrally in
// models/index.js, alongside every other cross-model association in this codebase.

/**
 * @module
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Invoices tab: getInvoiceList, the one paginated
 * list endpoint this module owns. The small reference-data endpoints that used
 * to live alongside it (getAgencyList/getItemCatalogList/getProfessionalList/
 * getRoleList/getProfessionalRateDetails) moved out (2026-08-27) to
 * invoiceReferenceDataController.js purely to stay under the 300-line file
 * guideline - no behavior change.
 */

// Whitelist of client-facing sort keys -> Sequelize model attribute names, so `orderby`
// can't be used to sort/inject on an arbitrary column (same pattern as locationController.js).
// Deliberately narrow: legacy's getListAction hardcodes `order by id desc` and never reads a
// dynamic orderby param at all - `id` (the real default) and `invDate` (the one column
// invoices.phtml actually makes clickable, via ng-click="orderBy('inv_date')") are the only
// two sort keys with any legacy precedent.
const ALLOWED_ORDER_COLUMNS = {
  id: "id",
  invDate: "invDate",
};

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Invoices tab: list invoices with search,
 * status/agency/date-range filters, sorting and pagination.
 * Mirrors legacy InvoicesController::getListAction's filters (status, invoice
 * date range, due date range, agency, invoice-number search, is_deleted = 0),
 * using this project's list-endpoint conventions (see locationController.js)
 * rather than legacy's DataTables-style start/length shape.
 * @param {import('express').Request} req
 * - req.query.page (Number, 0-indexed, default 0)
 * - req.query.pageSize (Number, default 10, max 100)
 * - req.query.search (String) - matches against invNo
 * - req.query.status (Number 2-7) - matches legacy status codes
 * - req.query.agency (Number) - time_entry_billable_agency.id
 * - req.query.invoiceDateFrom / invoiceDateTo (String, YYYY-MM-DD)
 * - req.query.dueDateFrom / dueDateTo (String, YYYY-MM-DD) - filters on invDueDate
 * - req.query.orderby (String, one of ALLOWED_ORDER_COLUMNS, default id)
 * - req.query.order ("asc" | "desc", default desc)
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: (Invoice & { agencyCode, fileCount })[], pagination: { page, pageSize, totalCount, totalPages, hasNextPage, hasPreviousPage }, status } - agencyCode comes from a billableAgency include (mirrors legacy's `tebr.agency_code` join) and fileCount from a second query against invoice_attachments (mirrors legacy's COALESCE(ia.fileCount, 0) subquery).
 */
export const getInvoiceList = async (req, res) => {
  try {
    const {
      page = 0,
      pageSize = 10,
      search = "",
      status = "",
      agency = "",
      invoiceDateFrom = "",
      invoiceDateTo = "",
      dueDateFrom = "",
      dueDateTo = "",
      orderby = "id",
      order = "desc",
    } = req.query;

    const pageNumber = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSizeNumber = Math.min(Math.max(1, Number.parseInt(pageSize, 10) || 10), 100);
    const offset = pageNumber * pageSizeNumber;
    const orderDirection = order.toString().toUpperCase() === "ASC" ? "ASC" : "DESC";
    const orderColumn = ALLOWED_ORDER_COLUMNS[orderby] || "id";

    // Always exclude soft-deleted invoices - mirrors legacy's "is_deleted = '0'" base condition.
    const whereCondition = { isDeleted: 0 };

    if (search && typeof search === "string" && search.trim()) {
      whereCondition.invNo = { [Op.like]: `%${search.trim()}%` };
    }

    if (status !== "" && !Number.isNaN(Number(status))) {
      whereCondition.status = Number(status);
    }

    if (agency !== "" && !Number.isNaN(Number(agency))) {
      whereCondition.agency = Number(agency);
    }

    if (invoiceDateFrom && invoiceDateTo) {
      whereCondition.invDate = { [Op.between]: [invoiceDateFrom, invoiceDateTo] };
    }

    if (dueDateFrom && dueDateTo) {
      whereCondition.invDueDate = { [Op.between]: [dueDateFrom, dueDateTo] };
    }

    const totalCount = await Invoice.count({ where: whereCondition });

    const invoices = await Invoice.findAll({
      where: whereCondition,
      order: [[orderColumn, orderDirection]],
      limit: pageSizeNumber,
      offset,
      include: [
        {
          model: BillableAgency,
          as: "billableAgency",
          attributes: ["agencyCode"],
          required: false,
        },
      ],
    });

    // Attachment counts per invoice - mirrors legacy's `COALESCE(ia.fileCount, 0)` correlated
    // subquery (getListAction), done as a second, simple GROUP BY query instead of a raw SQL
    // subquery literal, since it only needs to cover the current page's invoice ids.
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const attachmentCounts = invoiceIds.length
      ? await InvoiceAttachment.findAll({
          where: { invId: invoiceIds, status: "1" },
          // col() takes the raw DB column name, not the model's JS attribute name - it does
          // not go through the model's field mapping the way plain strings in `attributes`
          // do (fileName -> file_name, invId -> inv_id). Used explicitly here for both COUNT's
          // argument and the GROUP BY column to avoid relying on group's string-resolution
          // behavior, which - unlike `attributes` - isn't consistently one way elsewhere in
          // this codebase (some callers pass attribute names, others already wrap in col()).
          attributes: ["invId", [fn("COUNT", col("file_name")), "fileCount"]],
          group: [col("inv_id")],
          raw: true,
        })
      : [];
    const fileCountByInvoiceId = new Map(
      attachmentCounts.map((row) => [row.invId, Number(row.fileCount)]),
    );

    const data = invoices.map((invoice) => {
      const plain = invoice.toJSON();
      return {
        ...plain,
        agencyCode: plain.billableAgency?.agencyCode || null,
        fileCount: fileCountByInvoiceId.get(invoice.id) || 0,
        billableAgency: undefined,
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
    logger.error("Error fetching invoice list:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoices. Please try again.",
      data: [],
      status: 500,
    });
  }
};
