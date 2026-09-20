import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import BulkInvoiceSummary from "../../../../models/timeexpense/invoicing/BulkInvoiceSummary.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { computeBulkInvoicePreview } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoicePreviewHelpers.js";
import { denormalizeToLegacyShape } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGroupSummaryHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Time & Expense > Invoicing > Bulk Invoice Groups > Create Bulk Invoice - the
 * "Create Bulk Invoice Group" form's own submit (previewBulkInvoiceGroup) and
 * the minimal Summary screen's "Save as Draft" (createBulkInvoiceGroup). Split
 * out of bulkInvoiceController.js (list/delete) to stay under the 300-line file
 * guideline - both files share the `bulk-invoices` route prefix.
 * @returns {*} { success, data: <preview payload, see bulkInvoicePreviewHelpers.js's own response-shape comment>, status }
 */
export const previewBulkInvoiceGroup = async (req, res) => {
  try {
    const {
      billDateFrom,
      billDateTo,
      billingPeriodDateFrom,
      billingPeriodDateTo,
      cases,
      caseReferralFee,
      assignCaseReferralData,
    } = req.body;

    const preview = await computeBulkInvoicePreview({
      billDateFrom,
      billDateTo,
      caseReferralNo: cases,
      caseReferralFee,
      assignCaseReferralData,
    });

    return res.status(200).json({
      success: true,
      data: { ...preview, billingPeriodDateFrom, billingPeriodDateTo },
      status: 200,
    });
  } catch (error) {
    logger.error("Error previewing bulk invoice group:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to compute the bulk invoice group preview. Please try again.",
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups > Summary screen - "Save as Draft" (insert branch). Ported
 * from BulkinvoicesController::saveBulkInvoiceSummaryDraftAction's insert branch
 * (a fresh group - the "already exists, update" branch is updateBulkInvoiceGroup
 * below). Writes
 * bulk_invoices (status 3 - "summary saved, no invoices generated yet",
 * hardcoded in legacy too - see BulkInvoice.js's own status comment) +
 * bulk_invoice_summary, both inside one transaction.
 *
 * Deliberate deviation from legacy: legacy stores the *client-echoed*, preview-
 * time-computed grp_id (bulk_invoices.id + 1 at the moment Create was submitted,
 * non-atomic/unlocked - see bulkInvoicePreviewHelpers.js's getNextBulkInvoiceId
 * comment) directly as bulk_invoice_id, so two concurrent Create->Save flows can
 * collide on the same bulk_invoice_id (no unique constraint on that column).
 * This ignores the client's preview-time grpId/grpNo entirely and instead lets
 * bulk_invoices.id's own AUTO_INCREMENT assign the real id first, then sets
 * bulk_invoice_id = id - inherently race-free, and bulk_invoice_id remaining
 * equal to id in every row this endpoint ever creates is strictly simpler than
 * legacy's occasional (id != bulk_invoice_id) drift, not a behavior anything reads
 * depends on differing. Flagged to the user in the migration writeup as a real,
 * deliberate fix (item 8 - a bug, not a business rule), not decided silently.
 *
 * FIXED (2026-08-26, live-verification finding): inv_summary_data is now built via
 * denormalizeToLegacyShape (bulkInvoiceGroupSummaryHelpers.js) - legacy's own
 * snake_case shape, with grp_id/grp_no set to this row's real, just-assigned
 * groupId/groupNo - instead of echoing req.body verbatim. That verbatim echo was
 * two confirmed real bugs: the client's own stale preview-time grpId/grpNo got
 * persisted and read back forever (wrong group number shown on the Summary tab),
 * and legacy's own PHP read path can't parse camelCase at all (confirmed live - a
 * real saved group rendered as a blank page in legacy). See that helper's own doc
 * comment for the full finding.
 * @param {import('express').Request} req - req.body - the full preview payload from previewBulkInvoiceGroup above (grpId/ grpNo are accepted but ignored - see deviation note; also never stored - see the FIXED note above).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, bulkInvoiceId, groupId }, status }
 */
export const createBulkInvoiceGroup = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      billDateFrom,
      billDateTo,
      billingPeriodDateFrom,
      billingPeriodDateTo,
      cases,
      caseReferralFee,
      invoicesSummary,
      timeExpenseEntries,
    } = req.body;

    const group = await BulkInvoice.create(
      {
        billDateFrom,
        billDateTo,
        billingPeriodDateFrom,
        billingPeriodDateTo,
        cases,
        caseReferralFee,
        totalAmountInvoiced: invoicesSummary?.totalInvoiceAmount || 0,
        noOfAgencies: timeExpenseEntries ? Object.keys(timeExpenseEntries).length : 0,
        status: "3",
        createdBy: req.user.userId,
        createdAt: new Date(),
        modifiedBy: req.user.userId,
        modifiedAt: new Date(),
      },
      { transaction },
    );

    const groupId = group.id;
    const groupNo = `B${String(groupId).padStart(5, "0")}`;
    await group.update({ bulkInvoiceId: groupId, groupId: groupNo }, { transaction });

    await BulkInvoiceSummary.create(
      {
        bulkInvGrp: groupId,
        grpNo: groupNo,
        invSummaryData: JSON.stringify(denormalizeToLegacyShape(req.body, { groupId, groupNo })),
        status: 0,
        createdDate: new Date(),
        createdBy: req.user.userId,
        modifiedDate: new Date(),
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();
    return res.status(201).json({
      success: true,
      data: { id: groupId, bulkInvoiceId: groupId, groupId: groupNo },
      status: 201,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error saving bulk invoice group draft:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to save the bulk invoice group. Please try again.",
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > Summary screen (load-by-id mode) - "Save as Draft"
 * (update branch). Ported from saveBulkInvoiceSummaryDraftAction's own
 * `isSummaryExistInDb == 1` branch. Re-scoped from legacy's real, live UI, not
 * just its own controller: viewBulkInvoiceGroupSummary.phtml's own "Edit" link
 * for changing an already-saved group's dates/cases/fee is commented out
 * (`<!-- <a>Edit</a> -->`) - legacy itself never wired that up, so this doesn't
 * either (confirmed with the user, not decided silently). The only thing that's
 * actually live and re-savable here is Assign Case Referrals' own recomputed
 * preview (useAssignCaseReferrals.js already calls updatePreview for this mode
 * correctly - no changes needed there).
 *
 * Guarded server-side against a group that's already had invoices generated
 * (invoiceTabStatus) - matches the same defense-in-depth pattern
 * bulkInvoiceGenerateController.js already uses, and mirrors this screen's own
 * UI-level gate (BulkInvoiceGroupHeader's close icon, and Assign Case Referrals
 * itself, both already hide/disable once invoiceTabStatus is true).
 * @param {import('express').Request} req - req.params.id - bulk_invoices.bulkInvoiceId. req.body - the full recomputed preview payload (same shape as createBulkInvoiceGroup above).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { id, bulkInvoiceId, groupId }, status }
 */
export const updateBulkInvoiceGroup = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const group = await BulkInvoice.findOne({
      where: { bulkInvoiceId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!group) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Bulk invoice group not found", status: 404 });
    }

    const summaryRow = await BulkInvoiceSummary.findOne({
      where: { bulkInvGrp: id },
      order: [["id", "DESC"]],
      transaction,
    });
    if (!summaryRow?.invSummaryData) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Bulk invoice group summary not found", status: 404 });
    }

    if (JSON.parse(summaryRow.invSummaryData).invoiceTabStatus) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invoices have already been generated for this group and it can no longer be edited.",
        status: 400,
      });
    }

    const { billDateFrom, billDateTo, billingPeriodDateFrom, billingPeriodDateTo, cases, caseReferralFee, invoicesSummary, timeExpenseEntries } =
      req.body;

    await group.update(
      {
        billDateFrom,
        billDateTo,
        billingPeriodDateFrom,
        billingPeriodDateTo,
        cases,
        caseReferralFee,
        totalAmountInvoiced: invoicesSummary?.totalInvoiceAmount || 0,
        noOfAgencies: timeExpenseEntries ? Object.keys(timeExpenseEntries).length : 0,
        modifiedBy: req.user.userId,
        modifiedAt: new Date(),
      },
      { transaction },
    );

    await summaryRow.update(
      {
        invSummaryData: JSON.stringify(
          denormalizeToLegacyShape(req.body, { groupId: group.bulkInvoiceId, groupNo: group.groupId }),
        ),
        modifiedDate: new Date(),
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();
    return res.status(200).json({
      success: true,
      data: { id: group.id, bulkInvoiceId: group.bulkInvoiceId, groupId: group.groupId },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error updating bulk invoice group draft:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to save the bulk invoice group. Please try again.",
      status: 500,
    });
  }
};
