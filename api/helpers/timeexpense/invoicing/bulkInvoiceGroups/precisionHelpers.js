/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups - deterministic string-based precision math, ported from
 * osah.repos' PrecisionHelper.php verbatim (same truncate-not-round semantics).
 * Used only by the Bulk Invoice preview/summary computation
 * (bulkInvoicePreviewHelpers.js) - nothing else in this module uses truncation,
 * everything else (invoice totals, line items) uses computationHelpers.js's
 * round-half-up roundMoney instead. Do NOT swap these for roundMoney/toFixed -
 * the 4-decimal admin-fee-percentage truncation is a real, deliberate legacy
 * business rule (see calculateAgencyPercentage's own doc comment), not
 * incidental precision loss.
 *
 * PHP's safeRound (half-up rounding) has a real caller after all - PrecisionHelper::
 * calculateTotal (quantity*rate for each AAA role line item, called from
 * BulkinvoicesController::saveInvoiceItems / generateBulkInvoicesAction) - not
 * ported separately here: this module already has a single "round to cents"
 * implementation (computationHelpers.js's roundMoney) used everywhere else invoice
 * totals get rounded, and roundMoney IS itself a safeRound port as of 2026-08-28
 * (see that file's own doc comment) - so calculateAaaRoleQuantity below reusing
 * roundMoney for that half of calculateTotal is genuinely the same function
 * legacy's own calculateTotal calls, not an approximation of it.
 *
 * See ../MONEY-CONVENTIONS.md for the module-wide rule on when to reach for
 * this file's truncation math vs. computationHelpers.js's roundMoney.
 */

const AAA_DECIMAL_SCALE = 4;
const CURRENCY_DECIMAL_SCALE = 2;

/**
 * @description
 * Truncates (never rounds) a value to `scale` decimal places using string math,
 * matching PrecisionHelper.php's safeTruncate exactly.
 * Example: safeTruncate('0.28087448995746', 4) => '0.2808'
 * @param {*} value
 * @param {*} scale
 */
export const safeTruncate = (value, scale = AAA_DECIMAL_SCALE) => {
  let str = String(value);
  const negative = str.startsWith("-");
  if (negative) str = str.slice(1);

  if (!str.includes(".")) {
    str += `.${"0".repeat(scale)}`;
  }

  const [int, dec] = str.split(".");
  const truncatedDec = (dec + "0".repeat(scale)).slice(0, scale);

  const result = `${int}.${truncatedDec}`;
  return negative ? `-${result}` : result;
};

/**
 * @description
 * (agency_time / total_time) * 100, truncated to 4 decimals - one agency's share
 * of the total non-AAA billable hours across every agency in the group. Mirrors
 * calculateAgencyPercentage exactly, including the empty/non-numeric/zero-total
 * short-circuits (all return '0.0000' rather than throwing or returning NaN).
 * @param {*} agencyTime
 * @param {*} totalTime
 */
export const calculateAgencyPercentage = (agencyTime, totalTime) => {
  if (!agencyTime || !totalTime) return "0.0000";

  const agencyTimeStr = String(agencyTime);
  const totalTimeStr = String(totalTime);
  if (Number.isNaN(Number(agencyTimeStr)) || Number.isNaN(Number(totalTimeStr))) return "0.0000";
  if (Number(totalTimeStr) === 0) return "0.0000";

  const percentage = (Number(agencyTimeStr) / Number(totalTimeStr)) * 100;
  return safeTruncate(String(percentage), AAA_DECIMAL_SCALE);
};

/**
 * @description
 * (agency_percentage * total_aaa_amount) / 100, truncated to 2 decimals - this
 * agency's share of the pooled AAA (Administrative Law Judge/Staff Attorney/
 * Law Clerk) admin fee amount. Mirrors calculateAAAAllocation exactly.
 * @param {*} agencyPercentage
 * @param {*} totalAaaAmount
 */
export const calculateAAAAllocation = (agencyPercentage, totalAaaAmount) => {
  const allocation = (Number(agencyPercentage) * Number(totalAaaAmount)) / 100;
  return safeTruncate(String(allocation), CURRENCY_DECIMAL_SCALE);
};

/**
 * @description
 * (role_total_hours * agency_percentage) / 100, truncated to 4 decimals - one
 * agency's share of one AAA role's (ALJ/SA/Law Clerk/SAALJ) total hours. Mirrors
 * PrecisionHelper::calculateQuantity exactly - used only at Generate Invoices
 * time (bulkInvoiceGenerateHelpers.js) to build that role's invoice_items row for
 * this agency; the quantity*rate "total" half of PHP's calculateQuantity/
 * calculateTotal pair is computationHelpers.js's roundMoney instead (see this
 * file's own header comment).
 * @param {*} roleTotalHours
 * @param {*} agencyPercentage
 */
export const calculateAaaRoleQuantity = (roleTotalHours, agencyPercentage) => {
  if (!roleTotalHours || !agencyPercentage) return "0.0000";
  const quantity = (Number(roleTotalHours) * Number(agencyPercentage)) / 100;
  return safeTruncate(String(quantity), AAA_DECIMAL_SCALE);
};
