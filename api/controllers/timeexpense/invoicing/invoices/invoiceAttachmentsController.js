import { randomUUID } from "node:crypto";
import { mysqlSequelize as sequelize } from "../../../../../connections/seqDB.js";
import Invoice from "../../../../models/timeexpense/invoicing/Invoice.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { uploadInvoiceAttachment } from "../../../../helpers/timeexpense/invoicing/invoices/invoiceAttachmentS3Helper.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-20
 * @description
 * Invoice Listing's paperclip/"Attach Files to {invoice}" feature - the two
 * collection-level actions, List and Add. Ported from
 * InvoicesController::getInvoiceAttachmentsAction/addFileAction (osah.repos).
 * Remove and Download (the two per-attachment actions) moved out (2026-08-27)
 * to invoiceAttachmentActionsController.js purely to stay under the 300-line
 * file guideline - no behavior change.
 *
 * Two deliberate deviations from legacy, both documented in
 * docs/invoice-attachments-migration-prompt.md's Supplemental Checklist:
 *
 * 1. Single-hop upload. Legacy uploads each file to a per-user/per-invoice temp
 * disk directory immediately on drop (postimageuploadAction), then only moves
 * already-temp-uploaded files to S3 + inserts DB rows when Save is clicked
 * (addFileAction). That two-hop shape is a Dropzone.js auto-upload artifact,
 * not a business requirement - this always does the whole thing (S3 upload +
 * DB insert + log) in one request, on Save. There is therefore no port of
 * removeFileAction/postimageuploadAction - "remove a file that hasn't been
 * saved yet" is a purely client-side, no-API-call operation in the new UI
 * (nothing has been sent to the server yet to remove).
 *
 * 2. Download now requires the real invoice_attachments.id and looks up the
 * stored filepath server-side, scoped to the given invoice, rather than
 * trusting a client-supplied filepath the way legacy's
 * downloadEachAttachmentAction does (it takes the filepath straight out of the
 * POSTed `result` object with no DB lookup at all - a real, if narrow, gap
 * where a user could ask the endpoint to stream any S3 key they already knew).
 * See invoiceAttachmentActionsController.js's own downloadInvoiceAttachment.
 *
 * S3 access goes through this feature's own invoiceAttachmentS3Helper.js (2026-09-02), not the
 * shared helpers/s3.js used by several unrelated features - see that file's own module doc
 * comment for why.
 */

const ACTIVE_STATUS = "1";
const ATTACHMENT_ADDED_ACTION = 11;
const MAX_ATTACHMENTS = 5;

// Matches invoice_attachments.file_type ENUM (0=>xlsx, 1=>csv, 2=>pdf) - .xls is grouped with
// .xlsx (both spreadsheet formats share one icon/bucket client-side). Legacy's own switch has no
// .xls branch at all, silently leaving file_type NULL for a .xls upload despite accepting the
// MIME type client-side - not reproduced here, since that's a plain gap, not a business rule.
const FILE_TYPE_BY_EXTENSION = { xlsx: "0", xls: "0", csv: "1", pdf: "2" };

const getExtension = (fileName) => (fileName.split(".").pop() || "").toLowerCase();

// CODE_REVIEW M-2 fix: the S3 key is fully decoupled from the user-supplied filename - only a
// server-generated UUID (plus a charset-scrubbed extension) ever becomes part of the storage
// path. The original filename is kept solely as display-only metadata (invoice_attachments.
// file_name / the DTO returned to the frontend) and is never used to build a path/key, so a
// crafted filename (path separators, "..", etc.) can't shift the object outside the intended
// per-invoice prefix. Mirrors this same codebase's existing safe pattern in
// helpers/fileHelper.js's sanitizeFilename (used by csvUploadMiddleware.js) rather than the
// unsafe `` `_${uuid}_${originalFileName}` `` pattern in helpers/s3.js's generateUniqueS3Key
// (used by the case-documents feature), which still splices the raw original name into the key.
const buildAttachmentKey = (invoiceId, originalName) => {
  const extension = getExtension(originalName).replaceAll(/[^a-z0-9]/g, "");
  const extensionSuffix = extension ? `.${extension}` : "";
  return `timekeeping/invoice_attachments/${invoiceId}/${randomUUID()}${extensionSuffix}`;
};

const toAttachmentDto = (attachment) => ({
  id: attachment.id,
  fileName: attachment.fileName,
  fileType: attachment.fileType,
  uploadedDate: attachment.uploadedDate,
});

const invoiceNotFound = (res) =>
  res.status(404).json({ success: false, message: "Invoice not found", status: 404 });

const actionFailed = (res, error, action, message) => {
  logger.error(`Error ${action}:`, { error: error.message, stack: error.stack });
  return res.status(500).json({ success: false, message, status: 500 });
};

/**
 * @description
 * List an invoice's active attachments - matches getInvoiceAttachmentsAction
 * (status = '1' only; a removed/deleted attachment is soft-deleted, not really
 * gone, so it must never resurface here).
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { attachments: [{ id, fileName, fileType, uploadedDate }], fileCount }, status }
 */
export const getInvoiceAttachments = async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return invoiceNotFound(res);

    const attachments = await InvoiceAttachment.findAll({
      where: { invId: id, status: ACTIVE_STATUS },
      order: [["id", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: { attachments: attachments.map(toAttachmentDto), fileCount: attachments.length },
      status: 200,
    });
  } catch (error) {
    return actionFailed(res, error, "listing invoice attachments", "Unable to load attachments. Please try again.");
  }
};

/**
 * @description
 * Add attachments - matches addFileAction's real effect (S3 upload + one
 * invoice_attachments row + one inv_logs row per file), minus the temp-disk hop
 * (see module doc comment). The whole batch is one transaction - a deliberate
 * improvement over legacy's un-transacted per-file loop, where a later file
 * failing left earlier files in the batch already committed with no rollback.
 * agency_id is set from the invoice's own `agency` column, not legacy's hardcoded
 * literal `1` in addFileAction (confirmed against the table's own FK-shaped
 * column - the hardcoded 1 reads as a copy-paste artifact, not an intentional
 * constant, so it isn't reproduced).
 * @param {import('express').Request} req - req.params.id - invoices.id req.files - populated by invoiceAttachmentUpload multer middleware (fieldname "files", up to 5, memory storage, type/size/per-file-name already validated there); this handler owns the checks that need the invoice's existing state (running total count, duplicate filenames).
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: { attachments: [...new rows], fileCount }, status }
 */
export const addInvoiceAttachments = async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ success: false, message: "No files were provided.", status: 400 });
  }

  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) {
      await transaction.rollback();
      return invoiceNotFound(res);
    }

    const existingActive = await InvoiceAttachment.findAll({
      where: { invId: id, status: ACTIVE_STATUS },
      attributes: ["fileName"],
      transaction,
    });

    // Matches legacy's max-5 check (dzOptions/dzCallbacks.addedfile), evaluated against the
    // running total (already-saved + this batch), not just this batch's own size.
    if (existingActive.length + files.length > MAX_ATTACHMENTS) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `An invoice can have at most ${MAX_ATTACHMENTS} attachments.`,
        status: 400,
      });
    }

    // Matches legacy's duplicate-filename check - against both already-saved attachments and
    // other files in this same batch.
    const existingNames = new Set(existingActive.map((row) => row.fileName));
    const namesInBatch = new Set();
    for (const file of files) {
      if (existingNames.has(file.originalname) || namesInBatch.has(file.originalname)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `A file with this name has already been uploaded: ${file.originalname}`,
          status: 400,
        });
      }
      namesInBatch.add(file.originalname);
    }

    const now = new Date();
    const createdRows = [];
    for (const file of files) {
      const bareKey = buildAttachmentKey(id, file.originalname);
      // uploadInvoiceAttachment returns the COMPLETE key actually written (environment prefix
      // included) - that's what gets stored below, not the bare key, so a future read never has
      // to guess whether a stored filepath already has a prefix baked in. See
      // invoiceAttachmentS3Helper.js's own module doc comment for why this feature has its own
      // independent S3 integration instead of reusing the shared helpers/s3.js, and for why no
      // ClamAV pre-upload scan runs here - matches legacy, which never scanned these either.
      const filepath = await uploadInvoiceAttachment(file.buffer, bareKey);

      const extension = getExtension(file.originalname);
      const attachment = await InvoiceAttachment.create(
        {
          invId: id,
          filepath,
          fileName: file.originalname,
          agencyId: invoice.agency,
          status: ACTIVE_STATUS,
          fileType: FILE_TYPE_BY_EXTENSION[extension] ?? null,
          bulkInvGrpId: null,
          uploadedBy: req.user.userId,
          uploadedDate: now,
          modifiedDate: now,
        },
        { transaction },
      );

      await InvLog.create(
        {
          invId: id,
          invNo: invoice.invNo,
          extId: attachment.id,
          action: ATTACHMENT_ADDED_ACTION,
          description: "Attachment added to invoice",
          status: "1",
          createdAt: now,
          createdBy: req.user.userId,
        },
        { transaction },
      );

      createdRows.push(attachment);
    }

    await transaction.commit();
    return res.status(200).json({
      success: true,
      data: {
        attachments: createdRows.map(toAttachmentDto),
        fileCount: existingActive.length + createdRows.length,
      },
      status: 200,
    });
  } catch (error) {
    await transaction.rollback();
    return actionFailed(res, error, "adding invoice attachments", "Unable to upload attachments. Please try again.");
  }
};
