import InvoiceTemplate from "../../../../models/timeexpense/invoicing/InvoiceTemplate.js";
import { logger } from "../../../../../config/winstonLogger.js";

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > Manual invoice write path - New Invoice Draft's
 * default remit-to/tax/heading info. saveManualInvoice/updateManualInvoice
 * (2026-08-27, split out of this same file for the same reason) now live in
 * manualInvoiceSaveController.js/manualInvoiceUpdateController.js - both still
 * over 300 lines on their own once separated, so no further splitting was
 * useful past this point. The read-only View Invoice endpoints
 * (getInvoiceDetails/PaymentHistory/ActivityLogs) live in
 * invoiceDetailController.js - split out purely to stay under the 300-line
 * file guideline; no behavior change either side.
 */

/**
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Time & Expense > Invoicing > New Invoice Draft screen: default remit-to / tax
 * / heading info for a new manual invoice.
 * Note: the field is genuinely "tanInformation" here (invoice_template_manager. tan_information), not "taxInformation" - a different table (invoices. tax_information, see InvoiceTemplate.js vs Invoice.js) uses that name. The frontend maps tanInformation -> its own taxInformation field on read (useManualInvoiceForm.js); this isn't a bug, don't rename either column to "fix" it.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { heading, image, address, remitInformation, tanInformation, caseReferralFee }, status }
 */
export const getRemitDetails = async (req, res) => {
  try {
    const template = await InvoiceTemplate.findOne({ order: [["id", "ASC"]] });

    return res.status(200).json({
      success: true,
      data: template,
      status: 200,
    });
  } catch (error) {
    logger.error("Error fetching invoice remit details:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch remit-to details. Please try again.",
      data: null,
      status: 500,
    });
  }
};
