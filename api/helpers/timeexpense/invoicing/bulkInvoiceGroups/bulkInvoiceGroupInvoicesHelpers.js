import { fn, col } from "sequelize";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import BillableAgency from "../../../../models/timeexpense/invoicing/BillableAgency.js";
import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import BulkInvoiceSummary from "../../../../models/timeexpense/invoicing/BulkInvoiceSummary.js";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import { normalizeStoredSummaryPayload } from "./bulkInvoiceGroupSummaryHelpers.js";
import { shapeInvoiceRow, applySummaryCorrections } from "./bulkInvoiceInvoiceCorrectionHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail > Invoices tab. Ported from
 * BulkinvoicesController::getBulkInvoiceDetailsAction, including its real,
 * confirmed write-on-read behavior: the first time this loads after Generate
 * Invoices, each invoice's stored subtotal/inv_amt/balance is recomputed from its
 * own invoice_items and, if it drifted, corrected in place - gated by
 * bulk_invoices.is_corrected so it only ever fires once per group (matches
 * legacy's own `is_corrected != 1` guard exactly). The per-invoice correction
 * math itself and the stored-summary write-back live in
 * bulkInvoiceInvoiceCorrectionHelpers.js (split out to stay under the 300-line
 * file guideline) - this file is the top-level orchestration: load the group +
 * its invoices, run the correction pass, aggregate the group-level totals/modal
 * data, persist once, shape the response.
 *
 * CONFIRMED SCHEMA GAP (2026-08-26, live DESCRIBE invoices): legacy's own SELECT for this
 * screen reads `i.aaa_total`, and BulkinvoicesController::saveInvoiceMasterData UPDATEs it -
 * but no `aaa_total` column exists on the live `invoices` table (Invoice.js's own model
 * comment already flagged this as a known gap before this pass). Not a business rule to
 * reproduce (checklist item 8) - it's a genuine, currently-broken column reference in legacy,
 * not something a faithful port can select. Omitted from the query below; the one place it
 * would have fed back into the stored summary JSON (per-agency `aaa_total` display field) is
 * left untouched rather than written with a value that doesn't exist.
 */

/**
 * @description
 * Loads every invoice in a bulk group, applying the one-time rounding correction
 * above (gated by is_corrected), and shapes the response the Invoices tab needs.
 * @param {*} bulkInvoiceId
 * @returns {*} null if the group has no bulk_invoices row; otherwise { invoices, grpNo, bulkInvoiceId, billDateFrom, billDateTo, timeExpenseEntries, bulkInvoiceTotal, bulkInvoiceDiscount, oldBulkInvoiceTotal, bulkInvoiceStatus, adminCorrection, modalData, isCorrected, validationStatus, validationErrors }
 */
export const loadBulkInvoiceGroupInvoices = async (bulkInvoiceId) => {
  const group = await BulkInvoice.findOne({ where: { bulkInvoiceId } });
  if (!group) return null;

  const isCorrected = group.isCorrected === 1;
  const transaction = isCorrected ? null : await sequelize.transaction();

  try {
    const invoices = await Invoice.findAll({
      where: { bulkInvGrp: String(bulkInvoiceId) },
      include: [{ association: "items" }, { model: BillableAgency, as: "billableAgency", attributes: ["agencyCode"], required: false }],
      order: [["agencyName", "ASC"]],
      transaction,
    });

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const attachmentCounts = invoiceIds.length
      ? await InvoiceAttachment.findAll({
          where: { invId: invoiceIds, status: "1" },
          attributes: ["invId", [fn("COUNT", col("file_name")), "fileCount"]],
          group: [col("inv_id")],
          raw: true,
        })
      : [];
    const fileCountByInvoiceId = new Map(attachmentCounts.map((row) => [row.invId, Number(row.fileCount)]));

    const shapedResults = [];
    for (const invoice of invoices) {
      shapedResults.push(await shapeInvoiceRow(invoice, isCorrected, transaction, fileCountByInvoiceId));
    }

    let bulkInvoiceStatus = 0;
    let addedCorrections = 0;
    let removedCorrections = 0;
    let adminCorrection = 0;
    let bulkInvoiceDiscount = 0;
    const modalData = [];
    const validationErrors = [];
    const invoiceRows = shapedResults.map(({ row, discount, invAmt, modalEntry, validationError }) => {
      bulkInvoiceDiscount += discount;
      if (row.status === 2) bulkInvoiceStatus = 1;
      if (row.correctionType === "1") addedCorrections += row.correction;
      if (row.correctionType === "2") removedCorrections += row.correction;
      if (modalEntry) {
        adminCorrection += row.correction;
        modalData.push(modalEntry);
      }
      if (validationError) validationErrors.push(validationError);
      return row;
    });

    const bulkInvoiceTotal = Number(group.oldTotalAmountInvoiced || 0) + addedCorrections - removedCorrections;

    // Fetched either way (not just on the one-time-correction branch below): the group's own
    // timeExpenseEntries map is what lets BulkInvoiceGroupTabs navigate *from* this screen to
    // the Billable Activity tab (see that component's own goToBillableActivity) - the Invoices
    // response itself has no agency-map shape of its own to offer it from.
    const summaryRow = await BulkInvoiceSummary.findOne({
      where: { bulkInvGrp: bulkInvoiceId },
      order: [["id", "DESC"]],
      transaction,
    });
    // Normalized regardless of the stored row's own shape (legacy snake_case or this app's own
    // camelCase - see bulkInvoiceGroupSummaryHelpers.js) so BulkInvoiceGroupTabs always gets the
    // camelCase agency-map shape it renders/forwards, the same as the Summary tab's own response.
    const timeExpenseEntries = summaryRow?.invSummaryData
      ? normalizeStoredSummaryPayload(JSON.parse(summaryRow.invSummaryData)).timeExpenseEntries || {}
      : {};

    if (!isCorrected && transaction) {
      await group.update({ totalAmountInvoiced: bulkInvoiceTotal, isCorrected: 1 }, { transaction });

      if (summaryRow?.invSummaryData) {
        const updatedSummary = applySummaryCorrections(summaryRow, invoiceRows, bulkInvoiceDiscount, bulkInvoiceTotal, adminCorrection);
        await summaryRow.update({ invSummaryData: updatedSummary }, { transaction });
      }
      await transaction.commit();
    }

    return {
      invoices: invoiceRows,
      grpNo: group.groupId,
      bulkInvoiceId,
      billDateFrom: group.billDateFrom,
      billDateTo: group.billDateTo,
      timeExpenseEntries,
      bulkInvoiceTotal,
      bulkInvoiceDiscount,
      oldBulkInvoiceTotal: Number(group.oldTotalAmountInvoiced || 0),
      bulkInvoiceStatus,
      adminCorrection,
      modalData,
      // The *pre-call* value, always - matches legacy's own `$op['is_corrected'] = $is_corrected`
      // (set once, top of getBulkInvoiceDetailsAction, from the value fetched before correction
      // runs, never updated to reflect what this same call just did) - the Rounding Adjustments
      // modal's own auto-show condition (`isCorrected === 0`) depends on seeing the *old* value
      // to know whether *this* load is the one that just applied the correction.
      isCorrected: isCorrected ? 1 : 0,
      validationStatus: validationErrors.length ? 1 : 0,
      validationErrors,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};
