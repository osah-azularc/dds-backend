import dayjs from "dayjs";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceItem from "../../../../models/timeexpense/invoicing/InvoiceItem.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { sendCsvResponse, handleCsvExportError } from "../../../reports/shared/controllerUtils.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 18-08-2026
 * @description
 * Time & Expense > Invoicing > View Invoice screen's "View Invoice Details" CSV
 * export. Split out of invoiceDetailController.js (2026-08-27) purely to stay
 * under the 300-line file guideline - no behavior change.
 * getInvoiceDetails/getInvoicePaymentHistory (the two JSON read endpoints this
 * module used to share this file with) stay in invoiceDetailController.js.
 */

/**
 * @author Rizwan Hiroli
 * @date 18-08-2026
 * @description
 * Exports the invoice's line items as a CSV download. Mirrors legacy's
 * downloadInvoiceItemsAction/OsahDbReporting::invoiceItems column-for-column
 * (ID, Invoice ID, Invoice Number, Type, Entity Name, Professional, Quantity,
 * Rate, Unit, Total, Created By, LastName, FirstName), with one deliberate fix:
 * legacy's invoiceItems() query hardcoded `invoice_items.inv_id = '44'` (a
 * leftover test value, its $inv_id parameter is never actually referenced in
 * the query) - in production this exports invoice #44's items regardless of
 * which invoice the user is viewing. That reads as an unintentional bug, not a
 * business rule, so this filters on the real :id instead of replicating it.
 * "Professional" and "Created By" are exported as raw judge_assistant_clerk ids
 * (not resolved to names), matching legacy exactly - its own join for a
 * resolved professional name is present in the source but commented out/unused,
 * and "Created By" only gets a name via the separate LastName/FirstName columns.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} CSV file (Content-Disposition: attachment)
 */
export const exportInvoiceItems = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      where: { id, isDeleted: 0 },
      attributes: ["id", "invNo"],
    });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
        data: null,
        status: 404,
      });
    }

    const items = await InvoiceItem.findAll({
      where: { invId: id },
      include: [
        { model: JudgeAssistantClerk, as: "creator", attributes: ["firstName", "lastName"], required: false },
      ],
      order: [["id", "ASC"]],
    });

    const rows = items.map((item) => {
      const plain = item.toJSON();
      return {
        id: plain.id,
        invId: plain.invId,
        invNo: plain.invNo,
        itemType: plain.itemType,
        itemName: plain.itemName,
        professional: plain.professional,
        quantity: plain.quantity,
        rate: plain.rate,
        unit: plain.unit,
        total: plain.total,
        createdBy: plain.createdBy,
        lastName: plain.creator?.lastName ?? "",
        firstName: plain.creator?.firstName ?? "",
      };
    });

    const fields = [
      { label: "ID", value: "id" },
      { label: "Invoice ID", value: "invId" },
      { label: "Invoice Number", value: "invNo" },
      { label: "Type", value: "itemType" },
      { label: "Entity Name", value: "itemName" },
      { label: "Professional", value: "professional" },
      { label: "Quantity", value: "quantity" },
      { label: "Rate", value: "rate" },
      { label: "Unit", value: "unit" },
      { label: "Total", value: "total" },
      { label: "Created By", value: "createdBy" },
      { label: "LastName", value: "lastName" },
      { label: "FirstName", value: "firstName" },
    ];

    const filename = `invoice-${invoice.invNo.replaceAll("/", "-")}-items-${dayjs().format("YYYY-MM-DD")}.csv`;

    return sendCsvResponse(res, rows, fields, filename);
  } catch (error) {
    return handleCsvExportError(res, error);
  }
};
