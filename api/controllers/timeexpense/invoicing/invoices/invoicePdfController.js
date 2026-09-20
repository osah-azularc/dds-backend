import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import InvoiceTemplate from "../../../../models/timeexpense/invoicing/InvoiceTemplate.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { computeLineTotal } from "../../../../helpers/timeexpense/invoicing/shared/computationHelpers.js";
import { computeInvoiceFinancials } from "../../../../helpers/timeexpense/invoicing/shared/manualInvoiceHelpers.js";
import { resolveBillableItemDetails } from "../../../../helpers/timeexpense/invoicing/shared/billableLinkageHelpers.js";
import { buildInvoicePdfSections } from "../../../../helpers/timeexpense/invoicing/invoices/invoicePdfSections.js";
import { generateInvoicePdfHtml } from "../../../../helpers/timeexpense/invoicing/invoices/invoicePdfTemplate.js";
import { renderInvoicePdfBuffer } from "../../../../helpers/timeexpense/invoicing/invoices/invoicePdfService.js";
import { buildInvoicePdfBuffer } from "../../../../helpers/timeexpense/invoicing/shared/invoiceSendHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Time & Expense > Invoicing > New Invoice Draft/Edit Invoice screens: "View PDF"
 * - renders a PDF preview from the form's current (unsaved) values, without
 * writing anything to the database. Mirrors legacy's viewPdfWithoutSaveAction,
 * using "000-preview" as the placeholder invoice number the same way.
 *
 * Billable-activity-sourced items are resolved server-side the same way a real
 * save resolves them (resolveBillableItemDetails) rather than trusted from the
 * client, both so the preview's totals can't be tampered with and so a billable
 * expense item (blank quantity) doesn't wrongly total $0.00 - a confirmed gap,
 * closed 2026-08-19, in what was previously a bare computeLineTotal(quantity,
 * rate) call that didn't know about that case (see manualInvoiceHelpers.js's
 * computeInvoiceFinancials, which already handled it correctly for the real
 * save path this preview endpoint hadn't been kept in sync with).
 * @returns {*} application/pdf, inline
 */
export const previewInvoicePdf = async (req, res) => {
  try {
    const {
      agencyId,
      billDateFrom,
      billDateTo,
      invoiceDate,
      discount,
      discountDesc,
      remitInformation,
      taxInformation,
      items,
    } = req.body;

    const [agency, template] = await Promise.all([
      BillableAgency.findByPk(agencyId, { attributes: ["agencyDescription"] }),
      InvoiceTemplate.findOne({ order: [["id", "ASC"]] }),
    ]);
    if (!agency) {
      return res.status(400).json({ success: false, message: "Agency not found", status: 400 });
    }

    const billableItems = items.filter((item) => item.billable);
    const resolvedDetails = await resolveBillableItemDetails(billableItems);

    const { subtotal, total, error: financialsError } = computeInvoiceFinancials(
      items,
      discount,
      resolvedDetails,
    );
    if (financialsError) {
      return res.status(400).json({ success: false, message: financialsError, status: 400 });
    }

    // Enriched shape buildInvoicePdfSections expects - taskId mirrors what a real save would
    // persist onto invoice_items.task_id (buildInvoiceItemRows/buildBillableInvoiceItemRows):
    // the catalog id itself for a manual 'time'/'expense' row, the resolved source entry's own
    // task/expense-type id for a billable row, and item.itemCode (harmless, never matched by the
    // Case Referral Fee bucket check) for 'other'.
    const enrichedItems = items.map((item) => {
      if (item.billable) {
        const details = resolvedDetails.get(`${item.itemType}-${item.itemCode}`);
        return {
          itemType: item.itemType,
          itemCode: item.itemCode,
          professional: details?.professional ?? null,
          quantity: details?.quantity ?? null,
          rate: details?.rate ?? 0,
          total: details?.total ?? 0,
          taskId: details?.taskId ?? null,
        };
      }
      const isOther = item.itemType === "other";
      return {
        itemType: item.itemType,
        itemCode: item.itemCode,
        professional: isOther ? null : item.professional,
        quantity: item.quantity,
        rate: item.rate,
        total: computeLineTotal(item.quantity, item.rate),
        taskId: item.itemCode,
      };
    });
    const sections = await buildInvoicePdfSections(enrichedItems);

    const html = await generateInvoicePdfHtml({
      invNo: "000-preview",
      invDate: invoiceDate,
      billDateFrom,
      billDateTo,
      agencyName: agency.agencyDescription || "",
      sections,
      subtotal,
      discount,
      discountDesc,
      total,
      remitInformation,
      taxInformation,
      orgHeading: template?.heading || "",
      logoImage: template?.image || null,
    });

    const pdfBuffer = await renderInvoicePdfBuffer(html);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="invoice-preview.pdf"');
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error("Error generating invoice PDF preview:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to generate PDF preview. Please try again.",
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 20-08-2026
 * @description
 * Time & Expense > Invoicing > View Invoice screen: "View PDF" - renders the
 * *saved* invoice's PDF from its real DB data (unlike previewInvoicePdf above,
 * which renders unsaved form values). Matches legacy's openInvoicePdfAction
 * (generateSummary($inv_id, 'view') -> a static file legacy then opens in a new
 * tab); this app has no on-disk file step, so it renders on request and streams
 * the buffer straight back the same way previewInvoicePdf already does. Reuses
 * buildInvoicePdfBuffer(invoice, items) - the exact same helper resendInvoice
 * already uses to render a saved invoice's PDF - rather than a second rendering
 * path.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} application/pdf, inline
 */
export const viewInvoicePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ where: { id, isDeleted: 0 } });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found", status: 404 });
    }

    const items = await InvoiceItem.findAll({ where: { invId: id, isDeleted: 0 } });
    const pdfBuffer = await buildInvoicePdfBuffer(
      invoice.toJSON(),
      items.map((item) => item.toJSON()),
    );

    // invNo values contain a literal "/" (e.g. "2026/08-0199") - not valid in a filename, same
    // fix applied to the bulk-download zip entry names.
    const safeInvNo = String(invoice.invNo).replaceAll(/[/\\]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeInvNo}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error("Error generating invoice PDF:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to generate invoice PDF. Please try again.",
      status: 500,
    });
  }
};
