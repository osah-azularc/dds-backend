import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import dayjs from "dayjs";
import sendsgMail from "../../../../utilities/sendsgMail.js";
import { logger } from "../../../../../config/winstonLogger.js";
import { formatMoney } from "./computationHelpers.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Builds and sends the "Send Invoice" email - content/wording mirrors
 * InvoiceModel::sendInvoice/sendEmail (the two body variants, subject lines,
 * and the Grant C. Mintz billing-contact signature), dispatched through this
 * app's own SendGrid utility (sendsgMail.js) instead of legacy's PHPMailer/SMTP.
 *
 * Rendered via EJS (2026-09-02, switched from a hand-rolled {{key}} string replacer) - matches
 * this same module's own established convention for HTML rendering (invoicePdfTemplate.js's
 * ejs.renderFile). bodyMessage is interpolated with <%- %> (unescaped), not <%= %>, since it's
 * already-built HTML (real <br /> tags) - matches invoicePdf.ejs's own use of <%- %> for
 * pre-rendered HTML (its include(...) partials), not just a stylistic choice.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "../../../../views/emails/invoicing/invoiceEmail.ejs");

const formatDate = (value) => (value ? dayjs(value).format("MM/DD/YYYY") : "");

// isOverdue mirrors legacy's is_due_invoice flag: only true when this specific send lands the
// invoice on status 4 (Overdue) - a plain new-invoice send (status 5/Unpaid) always gets the
// standard body, never the past-due one.
const buildEmailContent = ({ invNo, agencyName, balance, invDueDate, isOverdue }) => {
  if (isOverdue) {
    return {
      subject: `Payment Status - Invoice ${invNo}`,
      bodyMessage:
        `Hello,<br /><br />` +
        `Our records indicate an outstanding balance of ${formatMoney(balance)} ` +
        `for invoice ${invNo}, which was due on ${formatDate(invDueDate)}. ` +
        `Please find your agency's past-due invoice(s) attached below.<br />` +
        `Payments should be sent to the JP Morgan account ending in 3638. ` +
        `PeopleSoft agencies must select location 2 to select the correct account.<br /><br />` +
        `If you have any questions, please feel free to contact me.<br /><br />`,
    };
  }
  return {
    subject: `Invoice ${invNo} - ${agencyName}`,
    bodyMessage:
      `Hello,<br /><br />` +
      `Please find attached your agency's invoice(s) for the prior month. ` +
      `Please allow for our Accounts Receivable to update the interunit. ` +
      `The invoice(s) will be available to process in one business week.<br />` +
      `Payments should be sent to the JP Morgan account ending in 3638. ` +
      `PeopleSoft agencies must select location 2 to select the correct account.<br /><br />` +
      `If you have any questions, please feel free to contact me.<br /><br />`,
  };
};

/**
 * @description
 * Sends the invoice PDF by email to every address in agencyEmail (comma-
 * separated, matching legacy's multi-recipient handling). Never throws - a
 * failed send doesn't roll back the invoice that was already saved (matches
 * legacy: the invoice stays created/sent-status even if the email itself fails,
 * surfaced back to the caller as { success: false } instead).
 * @returns {*} { success, sentCount, failedCount }
 */
export const sendInvoiceEmail = async ({
  invNo,
  agencyName,
  agencyEmail,
  balance,
  invDueDate,
  isOverdue,
  pdfBuffer,
  // Extra attachments (Attach Files feature - already shipped) stapled on alongside the
  // generated PDF, matching legacy's own sendBulkInvoicesAction. Already SendGrid-shaped by the
  // caller (invoiceSendHelpers.js's fetchUploadedAttachmentsForEmail) - this function doesn't
  // know or care where they came from.
  extraAttachments = [],
}) => {
  const { subject, bodyMessage } = buildEmailContent({ invNo, agencyName, balance, invDueDate, isOverdue });
  // Falls back to legacy's own hardcoded sender identity (InvoiceModel::sendInvoice/sendEmail -
  // 'Grant C. Mintz' <gmintz@osah.ga.gov>, unconditional on every environment there, no config)
  // when the env var isn't set - confirmed live (2026-09-02) that a missing
  // INVOICE_EMAIL_FROM_NAME silently sent as the wrong, generic "OSAH Billing" identity instead.
  // fromEmail deliberately does NOT fall back to the generic EMAIL_FROM (2026-09-04) - that's the
  // site-wide no-reply address used by every other email in this app; an invoice should never
  // look like it came from that identity just because INVOICE_EMAIL_FROM is unset in some
  // environment, confirmed live on the dev server (INVOICE_EMAIL_FROM missing there fell through
  // to EMAIL_FROM's noReply2@osah.ga.gov instead of matching legacy's gmintz@osah.ga.gov).
  const fromName = process.env.INVOICE_EMAIL_FROM_NAME || "Grant C. Mintz";
  const fromEmail = process.env.INVOICE_EMAIL_FROM || "gmintz@osah.ga.gov";

  const html = await ejs.renderFile(TEMPLATE_PATH, { bodyMessage, fromName, fromEmail });
  const attachments = [
    {
      content: pdfBuffer.toString("base64"),
      // Matches legacy's own attachment filename exactly - InvoiceModel::generateAttachment
      // names the saved PDF from just the numeric suffix of inv_no (explode('-', ...)[1], e.g.
      // "2025/06-0152" -> "0152.pdf"), not a descriptive "Invoice-..." name. Also avoids a real,
      // if minor, technical issue the old name had: inv_no's own "YYYY/MM-NNNN" shape means
      // `Invoice-${invNo}.pdf` always contained a literal "/" in the attachment filename.
      filename: `${invNo.split("-")[1] || invNo}.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    },
    ...extraAttachments,
  ];

  const recipients = (agencyEmail || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  const results = await Promise.allSettled(
    recipients.map((to) => sendsgMail(to, subject, html, attachments, fromName, fromEmail)),
  );
  const failedCount = results.filter((result) => result.status === "rejected").length;
  if (failedCount > 0) {
    logger.error("Error sending invoice email to one or more recipients", {
      invNo,
      failedCount,
      totalCount: recipients.length,
    });
  }

  return { success: recipients.length > 0 && failedCount < recipients.length, sentCount: recipients.length - failedCount, failedCount };
};
