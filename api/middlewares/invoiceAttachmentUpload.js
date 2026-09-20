import multer from "multer";

/*
    Created by  : Rizwan Hiroli
    Date        : 2026-08-20
    Description : Invoice Listing's "Attach Files" feature - multer config for the upload route.
                   Deliberately uses memoryStorage (buffers only, never touches this server's own
                   disk) rather than diskStorage - the port's single-hop design (browser -> Node
                   -> S3 directly, all in the one Save request) intentionally does not reproduce
                   legacy's two-hop flow (Dropzone auto-uploads each file to a per-user/per-invoice
                   temp directory on drop via postimageuploadAction, then addFileAction reads those
                   temp files back off disk and pushes them to S3 only when Save is clicked). See
                   invoice-attachments-migration-prompt.md's Supplemental Checklist item 2 for the
                   full reasoning - this file is that decision's concrete result.

                   File count (max 5) and duplicate-filename checks need the invoice's *existing*
                   attachment count/names from the database, so they're enforced in
                   invoiceAttachmentsController.js, not here - this middleware only enforces the
                   context-free rules (type, per-file size, request-level file count).
*/

// Matches legacy's dzOptions.acceptedFiles list exactly (invoicescontroller.js) - pdf/xlsx/xls/csv.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
]);

// Matches legacy's addedfile special-character check exactly.
const INVALID_FILENAME_CHARS = /[!@#$%^&*()]/;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error("Please upload only .xlsx, .csv, .pdf file types of size less than 1 MB"));
    return;
  }
  if (INVALID_FILENAME_CHARS.test(file.originalname)) {
    cb(new Error("File names should not contain special characters such as: !@#$%^&*()"));
    return;
  }
  cb(null, true);
};

// Matches legacy's dzOptions.maxFilesize (5) and per-file 1 MB cap exactly - the *running total*
// max-5-files check (existing + this batch) needs the invoice's current count from the database,
// so it's enforced in the controller instead.
const multerMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024, files: 5 },
}).array("files", 5);

// Multer reports both fileFilter rejections (a plain Error, from above) and its own limit
// violations (a MulterError, e.g. LIMIT_FILE_SIZE/LIMIT_FILE_COUNT) by calling next(error) -
// which would otherwise fall straight through to this app's default (HTML/stack-trace) error
// page rather than the JSON error body every other endpoint in this module returns. Wrapped here
// instead of touching that shared, app-wide handler.
const MULTER_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: "Please upload only .xlsx, .csv, .pdf file types of size less than 1 MB",
  LIMIT_FILE_COUNT: "An invoice can have at most 5 attachments.",
  LIMIT_UNEXPECTED_FILE: "An invoice can have at most 5 attachments.",
};

const uploadInvoiceAttachments = (req, res, next) => {
  multerMiddleware(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message =
      MULTER_ERROR_MESSAGES[error.code] || error.message || "Unable to upload attachments. Please try again.";
    res.status(400).json({ success: false, message, status: 400 });
  });
};

export default uploadInvoiceAttachments;
