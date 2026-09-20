/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Centralizes the invoicing module's money math (multiply + round-to-cents),
 * which was previously duplicated inline across manualInvoiceHelpers.js and
 * invoiceDetailController.js.
 *
 * Code review finding Backend L-3 (2026-08-17): this used to round via plain
 * native JS floating point (Number(x.toFixed(2))), not a decimal-safe library -
 * quantity=8.575, rate=1 rounded to 8.57 (native double stores 8.575 as
 * 8.57499999999999964...) where correct round-half-up decimal arithmetic gives
 * 8.58. Originally left as-is by team decision pending a real fix.
 *
 * Fixed 2026-08-28 via safeRoundString below - a JS port of legacy's own
 * PrecisionHelper::safeRound (PHP), the same string-based half-up rounding
 * precisionHelpers.js's safeTruncate already mirrors for truncation. The one
 * subtlety that matters: safeRound's input is (string)$floatValue, and PHP's
 * default float-to-string cast rounds to 14 SIGNIFICANT digits (its `precision`
 * ini setting) - a different algorithm than JS's native String()/toString(),
 * which produces the shortest string that round-trips to the exact same double
 * (exposing binary noise PHP's cast absorbs). Number(value).toPrecision(14)
 * below reproduces PHP's cast, not String(value) - using String(value) instead
 * looks equivalent but was verified to still disagree with real legacy PHP
 * output in ~0.04% of randomized cases; toPrecision(14) does not.
 *
 * Verified empirically against ACTUAL legacy PHP execution (PrecisionHelper.php
 * run via the project's own PHP 5.6 CLI, not just re-derived from reading the
 * source): 0 mismatches across 100,003 randomized quantity*rate cases compared
 * against calculateTotal(), and 0 mismatches across 70,014 cases (subtraction,
 * multi-item sums, negatives, explicit boundaries like 0.005/-1.005/99999.995)
 * compared against safeRound() directly. quantity=8.575, rate=1 now gives 8.58,
 * matching legacy exactly.
 *
 * Deliberately NOT changed to a full decimal library (e.g. decimal.js, present
 * only as jsdom's transitive dependency, not a declared one): that would make
 * this app MORE precise than legacy ever was (legacy's own multiply still
 * happens in an ordinary PHP float before safeRound's string-based rounding
 * step), which for this migration's legacy-parity goal is the wrong tradeoff -
 * it would make some outputs disagree with what legacy would have shown for the
 * same inputs, not just fix noise. safeRoundString fixes the same class of bug
 * legacy's own safeRound already fixed, in the same way, nothing more.
 *
 * See ../MONEY-CONVENTIONS.md for how this relates to bulkInvoiceGroups/
 * precisionHelpers.js's own (deliberately different) truncation-based math, and
 * bulkInvoiceInvoiceCorrectionHelpers.js's own local roundToCents (matches
 * legacy's plain round(), a different legacy function than safeRound - stays on
 * Math.round(x*100)/100 regardless of this file's own formula, see that file's
 * header comment).
 */

// String-based half-up rounding to `scale` decimal places - see this file's own header comment
// for why Number(value).toPrecision(14) (not String(value)) is the correct starting point to
// match legacy's PrecisionHelper::safeRound exactly.
const safeRoundString = (value, scale) => {
  let str = Number(value).toPrecision(14);
  // Money-scale values in this module never actually reach exponential notation (toPrecision(14)
  // only produces it for magnitudes >=1e21 or <1e-7) - guarded anyway rather than assumed.
  if (str.includes("e") || str.includes("E")) str = Number(value).toFixed(Math.max(scale, 20));

  const negative = str.startsWith("-");
  if (negative) str = str.slice(1);
  if (!str.includes(".")) str += `.${"0".repeat(scale + 1)}`;

  let [intPart, decPart] = str.split(".");
  decPart = decPart.padEnd(scale + 1, "0");
  const target = decPart.slice(0, scale).split("");
  const nextDigit = Number(decPart[scale] || "0");

  if (nextDigit >= 5) {
    let carry = 1;
    for (let i = target.length - 1; i >= 0 && carry; i -= 1) {
      const digit = Number(target[i]) + carry;
      if (digit === 10) {
        target[i] = "0";
      } else {
        target[i] = String(digit);
        carry = 0;
      }
    }
    if (carry) intPart = String(Number(intPart) + 1);
  }

  const result = `${intPart}.${target.join("")}`;
  return negative ? `-${result}` : result;
};

// Rounds a raw number to money precision (2 decimals) - decimal-safe, verified legacy-parity
// half-up rounding. See this file's own header comment.
export const roundMoney = (value) => Number(safeRoundString(value, 2));

// quantity * rate, rounded to money precision - one invoice line item's total.
export const computeLineTotal = (quantity, rate) => roundMoney(Number(quantity) * Number(rate));

// Sums each item's own ROUNDED total (computeLineTotal per item), not raw quantity*rate -
// BUG FIX 2026-09-03 (precision audit): the previous version summed unrounded products and
// rounded once at the end, which could disagree by a cent from SUM(invoice_items.total) - the
// individually-stored line-item totals - for the same invoice, since each invoice_items row's own
// `total` is computeLineTotal(quantity, rate) (rounded per item). Real legacy has this exact same
// split (its own client-computed invoices.subtotal and its server-recomputed invoice_items.total
// rows come from two independent code paths and can genuinely disagree - confirmed empirically,
// e.g. quantity=8.575/rate=1 stores item total $8.58 but legacy's own subtotal shows $8.57) -
// explicit product decision (2026-09-03): match the backend/self-consistent value here rather
// than reproduce that legacy inconsistency, so invoices.subtotal always equals the real sum of
// this invoice's own stored invoice_items.total rows.
export const sumLineItems = (items) =>
  items.reduce((sum, item) => sum + computeLineTotal(item.quantity, item.rate), 0);

// Sums each item's own already-computed `total` (not a quantity*rate recompute) - matches
// legacy's generateSummary() exactly ($data['all_items_total'] += $item['total']), which is what
// powers View/Edit Invoice's live subtotal display and the PDF/Send/Resend/Bulk-Download summary,
// none of which trust the stored invoices.subtotal/inv_amt columns. Added 2026-08-28: those two
// columns can go stale relative to the real invoice_items (a real historical create-time bug -
// see MONEY-CONVENTIONS.md - left a handful of invoices with a corrupted stored subtotal while
// their real items were fine) with nothing to ever re-sync them, so every display consumer needs
// to derive the total from the real items itself, the same way legacy always has, rather than
// trusting a column that can silently drift from what the invoice's own line items say.
export const sumItemTotals = (items) =>
  roundMoney(items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// "$1,234.56" - used in the Send Invoice email body (InvoiceModel::sendInvoice's overdue
// wording embeds the balance directly in the sentence, not just as a PDF line item).
export const formatMoney = (value) => currencyFormatter.format(Number(value) || 0);
