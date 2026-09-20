import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import BulkInvoice from "../../../../models/timeexpense/invoicing/BulkInvoice.js";
import BulkInvoiceSummary from "../../../../models/timeexpense/invoicing/BulkInvoiceSummary.js";
import InvoiceTemplate from "../../../../models/timeexpense/invoicing/InvoiceTemplate.js";
import { logger } from "../../../../../config/winstonLogger.js";
import {
  normalizeStoredSummaryPayload,
  denormalizeToLegacyShape,
} from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGroupSummaryHelpers.js";
import { loadAaaLookups, generateInvoicesForAgencies } from "../../../../helpers/timeexpense/invoicing/bulkInvoiceGroups/bulkInvoiceGenerateHelpers.js";

/**
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > Summary screen > Generate Invoices. Ported from
 * BulkinvoicesController::generateBulkInvoicesAction/saveInvoice/
 * saveInvoiceMasterData/saveInvoiceItems - reuses the manual-invoice write path's
 * already-proven building blocks (manualInvoiceHelpers.js/
 * billableLinkageHelpers.js) for everything except the AAA role line items and
 * the per-agency orchestration loop, which are genuinely new (see
 * bulkInvoiceGenerateHelpers.js).
 *
 * NOT idempotent, by design (matches legacy - regenerating would double-invoice
 * the same billable activity). Guarded two ways: the group's own invoiceTabStatus
 * must not already be true (server-side belt-and-suspenders for the frontend's own
 * button-hides-once-generated behavior), and every agency must have real case
 * referral data assigned first (mirrors the Generate Invoices button's own
 * disabled condition, enforced server-side too since a client can't be trusted
 * alone for a real financial write).
 *
 * Legacy's own email-validation loop in generateBulkInvoicesAction is NOT ported
 * - traced end-to-end, its result (error_list) is never read by the frontend
 * success handler; the real "Missing Information" banner is already recomputed
 * fresh on every read of the Invoices tab (bulkInvoiceInvoiceCorrectionHelpers.js,
 * already shipped).
 *
 * Shape-preserving write-back: the stored summary's invoiceTabStatus flag is set
 * directly on the raw parsed JSON (not on the normalized `preview`), same
 * discipline applySummaryCorrections already uses (bulkInvoiceInvoiceCorrectionHelpers.js)
 * - a legacy-created (snake_case) row must stay snake_case after Generate runs on
 * it, not get silently converted to camelCase.
 * @param {import('express').Request} req - req.params.id - bulk_invoices.bulkInvoiceId (business-key id, same convention as every other group-detail route in this module).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { bulkInvoiceId, grpNo }, status }
 */
export const generateBulkInvoices = async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const group = await BulkInvoice.findOne({ where: { bulkInvoiceId: id }, transaction, lock: transaction.LOCK.UPDATE });
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

    // Kept separately from `preview` (below) so the eventual write-back only ever changes the one
    // field that actually needs to (invoiceTabStatus) on the RAW stored shape - never
    // re-stringifying the normalized/camelCase `preview` object itself, which would silently
    // convert an already-legacy-shaped row (snake_case) to camelCase on its very first Generate,
    // reintroducing the exact "legacy can't read this row anymore" bug denormalizeToLegacyShape
    // was just fixed for (bulkInvoiceGroupSummaryHelpers.js's own doc comment).
    const rawStoredData = JSON.parse(summaryRow.invSummaryData);
    const preview = normalizeStoredSummaryPayload(rawStoredData);

    if (preview.invoiceTabStatus) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invoices have already been generated for this group.",
        status: 400,
      });
    }

    const hasAssignedReferrals = Boolean(
      preview.caseReferralData && Object.keys(preview.caseReferralData).length > 0,
    );
    if (!hasAssignedReferrals) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Case referrals must be assigned before generating invoices.",
        status: 400,
      });
    }

    const remitTemplate = await InvoiceTemplate.findOne({ order: [["id", "ASC"]], transaction });
    const aaaLookups = await loadAaaLookups();
    const now = new Date();

    const { masterTotal, agenciesCount } = await generateInvoicesForAgencies({
      id,
      preview,
      remitTemplate,
      aaaLookups,
      userId: req.user.userId,
      transaction,
    });

    await group.update(
      {
        totalAmountInvoiced: masterTotal,
        oldTotalAmountInvoiced: masterTotal,
        noOfAgencies: agenciesCount,
        status: "2",
        modifiedBy: req.user.userId,
        modifiedAt: now,
      },
      { transaction },
    );

    rawStoredData.invoiceTabStatus = true;
    await summaryRow.update(
      {
        invSummaryData: JSON.stringify(rawStoredData),
        status: 1,
        modifiedDate: now,
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: { bulkInvoiceId: Number(id), grpNo: group.groupId },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error generating bulk invoices:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to generate invoices for this bulk invoice group. Please try again.",
      status: 500,
    });
  }
};

/**
 * @author Rizwan Hiroli
 * @date 2026-08-27
 * @description
 * Bulk Invoice Groups > Summary screen (Create-flow, unsaved preview) > Generate
 * Invoices. Matches legacy's own UX: Generate is reachable straight from Assign
 * Case Referrals with no explicit Save as Draft in between
 * (generateBulkInvoicesAction's own insert-if-not-exists branch does the same).
 * Explicit product decision (2026-08-27, flagged and confirmed with the user, not
 * decided silently) to match that UX - but NOT legacy's own confirmed defect
 * alongside it (see the migration doc's checklist item 17/18): legacy can leave a
 * real, permanently-dangling `invoices` row with no backing `bulk_invoices` row if
 * generation fails partway through. Fixed here by doing the group-create AND every
 * agency's invoice-generation in ONE transaction (reusing createBulkInvoiceGroup's
 * own insert shape and generateBulkInvoices' own generateInvoicesForAgencies loop)
 * - a failure anywhere in this request rolls back everything: no group, no
 * invoices, nothing left behind. Strictly safer than legacy, same UX as legacy.
 *
 * This is a genuinely different code path from generateBulkInvoices above (which
 * still exists, unchanged, for the load-by-id "reopen an already-saved draft and
 * Generate later" case - Save as Draft without immediately generating is still
 * fully supported). This one is create+generate fused into a single request for
 * the case where the user never saves at all.
 * @param {import('express').Request} req - req.body - the full preview payload (same shape createBulkInvoiceGroup takes - reuses bulkInvoiceCreateBodySchema, see the route file's own comment).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { bulkInvoiceId, grpNo }, status } - same shape as generateBulkInvoices above, so the frontend can navigate to the Invoices tab identically either way.
 */
export const createAndGenerateBulkInvoices = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const preview = req.body;
    const hasAssignedReferrals = Boolean(
      preview.caseReferralData && Object.keys(preview.caseReferralData).length > 0,
    );
    if (!hasAssignedReferrals) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Case referrals must be assigned before generating invoices.",
        status: 400,
      });
    }

    const group = await BulkInvoice.create(
      {
        billDateFrom: preview.billDateFrom,
        billDateTo: preview.billDateTo,
        billingPeriodDateFrom: preview.billingPeriodDateFrom,
        billingPeriodDateTo: preview.billingPeriodDateTo,
        cases: preview.cases,
        caseReferralFee: preview.caseReferralFee,
        totalAmountInvoiced: preview.invoicesSummary?.totalInvoiceAmount || 0,
        noOfAgencies: preview.timeExpenseEntries ? Object.keys(preview.timeExpenseEntries).length : 0,
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

    // Built once, mutated in place after generation succeeds (invoiceTabStatus) - same
    // shape-preserving discipline generateBulkInvoices above uses, just starting from a payload
    // this endpoint itself just denormalized instead of one read back from storage.
    const rawStoredData = denormalizeToLegacyShape(preview, { groupId, groupNo });

    const summaryRow = await BulkInvoiceSummary.create(
      {
        bulkInvGrp: groupId,
        grpNo: groupNo,
        invSummaryData: JSON.stringify(rawStoredData),
        status: 0,
        createdDate: new Date(),
        createdBy: req.user.userId,
        modifiedDate: new Date(),
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    const remitTemplate = await InvoiceTemplate.findOne({ order: [["id", "ASC"]], transaction });
    const aaaLookups = await loadAaaLookups();
    const now = new Date();

    const { masterTotal, agenciesCount } = await generateInvoicesForAgencies({
      id: groupId,
      preview,
      remitTemplate,
      aaaLookups,
      userId: req.user.userId,
      transaction,
    });

    await group.update(
      {
        totalAmountInvoiced: masterTotal,
        oldTotalAmountInvoiced: masterTotal,
        noOfAgencies: agenciesCount,
        status: "2",
        modifiedBy: req.user.userId,
        modifiedAt: now,
      },
      { transaction },
    );

    rawStoredData.invoiceTabStatus = true;
    await summaryRow.update(
      {
        invSummaryData: JSON.stringify(rawStoredData),
        status: 1,
        modifiedDate: now,
        modifiedBy: req.user.userId,
      },
      { transaction },
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: { bulkInvoiceId: groupId, grpNo: groupNo },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error creating and generating bulk invoices:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to generate invoices for this bulk invoice group. Please try again.",
      status: 500,
    });
  }
};
