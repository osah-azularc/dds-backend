import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { readLogoAsDataUrl } from "../../admin/invoiceSettingsHelper.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Renders a manual invoice's PDF HTML - ported from
 * InvoiceModel::generateAttachment/getPdfFirstPage (osah.repos), matching its
 * real two-page structure, column layout, and formatting, not a fresh design.
 * Section bucketing (Case Referral Fee / Administrative Fees / Adjudication
 * Fees / Expenses, each keyed off the billing professional's role) is done by
 * invoicePdfSections.js's buildInvoicePdfSections - this file only formats the
 * already-bucketed `sections` for display and delegates rendering. Confirmed and
 * closed 2026-08-19: earlier revisions of this file only ever rendered a single
 * hardcoded "Case Referral Fee" section regardless of the real item types on the
 * invoice - see invoicePdfSections.js's own doc comment for the full story.
 *
 * All markup lives in api/views/pdf/invoicePdf.ejs (+ its header/footer partials) - this file
 * only formats data and delegates rendering, mirroring calendarHtmlBuilder.js's existing
 * pattern in this codebase. EJS's <%= %> auto-escapes every value, so no manual esc() wrapper
 * is needed for user-entered content (agencyName, discountDesc, remit/tax info, etc).
 *
 * Logo (BUG FIX 2026-09-09): legacy's PDF reads the admin-uploaded file
 * (invoice_template_manager.image, DOCUMENT_ROOT/upload/invoice-template-manager/<image>) - a
 * DIFFERENT file from the one legacy's Send Invoice EMAIL uses (its own hardcoded
 * osah-email-logo.jpg). This file previously hardcoded the email's logo for the PDF too, with a
 * "no such upload exists in this app" justification that went stale the moment Admin > Time,
 * Expense, Invoicing > Invoice Settings (invoiceSettingsHelper.js, 2026-08-31) shipped that exact
 * upload - from then on an admin could upload a custom PDF logo and the PDF would silently keep
 * showing the generic eportal one regardless. Now resolves `data.logoImage` (the caller's own
 * `template.image`, the same invoice_template_manager row already being read for `orgHeading`)
 * to a data URI via invoiceSettingsHelper.js's own readLogoAsDataUrl - reused rather than
 * duplicated, matching this codebase's own "one EFS-read implementation per concern" convention
 * (see invoiceAttachmentS3Helper.js's module doc for the same reasoning applied to S3). Falls
 * back to the same public OSAH logo URL as before - matching legacy's own PDF fallback (a blank
 * `$template['image']` renders a broken/empty <img> in legacy; this app degrades to a real logo
 * instead) - when no logo has been uploaded yet, or the EFS read fails for any reason.
 * Page-break: legacy's mPDF-specific literal `<pagebreak>` tag has no meaning to a
 * Chromium-based renderer - translated to the standard CSS page-break-after property
 * (see invoicePdf.ejs), same visual result via the mechanism Puppeteer actually respects.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, "../../../../views/pdf/invoicePdf.ejs");
const FALLBACK_LOGO_URL = "https://eportal.osah.ga.gov/external/images/osah-email-logo.jpg";

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// "1,234.56" - no currency symbol, matches legacy's number_format($x, 2, '.', ',') exactly;
// the template prepends "$" itself the same places legacy does.
const formatNumber = (value) => numberFormatter.format(Number(value) || 0);
const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
};

const professionalName = (item) => `${item.lastName || ""} ${item.firstName || ""}`.trim();

// Case Referral Fee rows - unchanged from before this fix, still the one section this app has
// always been able to produce, so its own formatting stays as-is.
const mapCaseReferralRow = (item) => ({
  quantityFormatted: Number(item.quantity),
  rateFormatted: Number(item.rate).toFixed(2),
  totalFormatted: formatNumber(item.total),
});

// Adjudication Fees rows (time_alj/time_sa/time_saalj) - TASK/TYPE column is always the fixed
// label "Legal" in legacy, not the item's real task name (matches generateAttachment's literal
// 'Legal' cell, not $item['task_name']).
const mapAdjudicationRow = (item) => ({
  professionalName: professionalName(item),
  userTypeLabel: item.userTypeLabel || "",
  quantityFormatted: formatNumber(item.quantity),
  rateFormatted: formatNumber(item.rate),
  totalFormatted: formatNumber(item.total),
});

// Administrative Fees rows (all_agencies_administrative_fee) - quantity is legacy's one 4-decimal
// exception (number_format($qty, 4, ...)), no Professional name is ever shown for this section.
const mapAdminFeeRow = (item) => ({
  userTypeLabel: item.userTypeLabel || "",
  quantityFormatted: Number(item.quantity || 0).toFixed(4),
  rateFormatted: formatNumber(item.rate),
  totalFormatted: formatNumber(item.total),
});

// Expenses rows (expense_cma/alj/saalj/sa/lawclerk) - grouped by (expense type, professional),
// see invoicePdfSections.js's groupExpenseItem for why QTY/RATE render blank here: legacy's own
// grouped record has no quantity/rate key at all, only TOTAL is ever real for these rows.
const mapExpenseRow = (item) => ({
  taskName: item.taskName || "",
  professionalName: professionalName(item),
  userTypeLabel: item.userTypeLabel || "",
  totalFormatted: formatNumber(item.total),
});

const formatSections = (sections) => ({
  caseReferral: sections.caseReferral.map(mapCaseReferralRow),
  timeAlj: sections.timeAlj.map(mapAdjudicationRow),
  timeSa: sections.timeSa.map(mapAdjudicationRow),
  timeSaalj: sections.timeSaalj.map(mapAdjudicationRow),
  hasAdjudicationFees:
    sections.timeAlj.length > 0 || sections.timeSa.length > 0 || sections.timeSaalj.length > 0,
  allAgenciesAdministrativeFee: sections.allAgenciesAdministrativeFee.map(mapAdminFeeRow),
  expenseCma: sections.expenseCma.map(mapExpenseRow),
  expenseAlj: sections.expenseAlj.map(mapExpenseRow),
  expenseSaalj: sections.expenseSaalj.map(mapExpenseRow),
  expenseSa: sections.expenseSa.map(mapExpenseRow),
  expenseLawclerk: sections.expenseLawclerk.map(mapExpenseRow),
  hasExpenses:
    sections.expenseCma.length > 0 ||
    sections.expenseAlj.length > 0 ||
    sections.expenseSaalj.length > 0 ||
    sections.expenseSa.length > 0 ||
    sections.expenseLawclerk.length > 0,
  summary: {
    administrativeFeeFormatted: formatNumber(sections.summary.administrativeFee),
    hasAdministrativeFee: sections.summary.administrativeFee > 0,
    caseReferralCount: sections.caseReferral.length,
    caseReferralFormatted: formatNumber(sections.summary.caseReferral),
    timeExpense: sections.summary.timeExpense.map((row) => ({
      label: row.label === "" ? "Default" : row.label,
      totalFormatted: formatNumber(row.total),
    })),
  },
});

/**
 * @description
 * data.invNo is "000-preview" for an unsaved View PDF preview (matches legacy's
 * own placeholder in viewPdfWithoutSaveAction) - a real invoice number for a
 * saved invoice. data.logoImage is the invoice_template_manager row's own `image`
 * filename (same value callers already fetch for orgHeading) - see this file's
 * own module doc comment for why it's resolved here rather than passed pre-resolved.
 * @param {*} data
 * @returns {*} Promise<string> - complete HTML document, two pages (cover + itemized), matching generateAttachment's page-1/page-2 split.
 */
export const generateInvoicePdfHtml = async (data) => {
  const {
    invNo,
    invDate,
    billDateFrom,
    billDateTo,
    agencyName,
    sections,
    subtotal,
    discount,
    discountDesc,
    total,
    remitInformation,
    taxInformation,
    orgHeading,
    logoImage,
  } = data;

  const logoUrl = (await readLogoAsDataUrl(logoImage)) || FALLBACK_LOGO_URL;

  return ejs.renderFile(TEMPLATE_PATH, {
    logoUrl,
    orgHeading,
    agencyName,
    invNo,
    invDateFormatted: formatDate(invDate),
    billDateFromFormatted: formatDate(billDateFrom),
    billDateToFormatted: formatDate(billDateTo),
    sections: formatSections(sections),
    subtotalFormatted: formatNumber(subtotal),
    discount,
    discountDesc,
    discountFormatted: formatNumber(discount),
    totalFormatted: formatNumber(total),
    remitInformation,
    taxInformation,
  });
};
