import Joi from "joi";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-24
 * @description
 * Bulk Invoice Groups > Create Bulk Invoice / minimal Summary screen ("Save as
 * Draft") body schemas - split out of invoicingValidators.js to keep that file
 * under the 300-line guideline (it was already at ~262 lines before these two
 * schemas would have pushed it to ~335). Use with invoicingValidators.js's own
 * validateBody middleware factory, same as every other schema in this module.
 */

// Required (non-blank) YYYY-MM-DD date - the Bulk Invoice Group Create form's own 4 date fields
// are all required client-side (bulkinvoicescontroller.js's saveInvoicegroup), unlike every list
// screen's optional date-range filters (invoicingValidators.js's own dateStringDashboardSchema).
const requiredDateStringSchema = Joi.string()
  .pattern(/^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/)
  .required()
  .messages({ "string.pattern.base": "Date must be in YYYY-MM-DD format" });

// Joi.string().min() validates string *length*, not date value - a real value comparison needs
// .custom() (dates aren't zero-padded by requiredDateStringSchema's own pattern, e.g. "2026-9-1"
// vs "2026-10-1", so even a lexicographic string compare would be wrong here). Shared by both
// schemas below so the create/save-draft endpoint enforces the same basic sanity check as the
// preview endpoint - it's reachable directly over the API without going through preview first,
// and the rest of its own schema is deliberately permissive (unknown(true)), so this one field
// pair is worth keeping consistent rather than trusting every caller to go through Create first.
const dateToNotBeforeFrom = (fromField) =>
  requiredDateStringSchema.custom((value, helpers) => {
    const fromValue = helpers.state.ancestors[0][fromField];
    if (fromValue && new Date(value) < new Date(fromValue)) {
      return helpers.message("Date from cannot be greater than date to filed");
    }
    return value;
  });

// Bulk Invoice Groups > Create Bulk Invoice form - previewBulkInvoiceGroup. Mirrors
// saveInvoicegroup's client-side checks (bulkinvoicescontroller.js): billDateFrom <= billDateTo
// (legacy's own validateDate() checks only this one ordering - not the billing period's, and not
// any cross-check between the two ranges - reproduced as-is, not tightened). cases may be 0
// (legacy's own check is only "must be defined", not "> 0").
//
// assignCaseReferralData is optional and defaults to {} (the Create form's own first preview call
// never sends it - only the Assign Case Referrals modal's "Update" does, re-calling this same
// endpoint with real per-agency data - see bulkinvoicescontroller.js's updateAssignCaseReferral).
// Keyed by agency_id (stringified object key), value is that agency's assigned referral count -
// matches caseReferralFor's own lookup key in bulkInvoiceLookupHelpers.js.
export const bulkInvoicePreviewBodySchema = Joi.object({
  billDateFrom: requiredDateStringSchema,
  billDateTo: dateToNotBeforeFrom("billDateFrom"),
  billingPeriodDateFrom: requiredDateStringSchema,
  billingPeriodDateTo: requiredDateStringSchema,
  cases: Joi.number().integer().min(0).required(),
  caseReferralFee: Joi.number().min(0).precision(2).required(),
  assignCaseReferralData: Joi.object().pattern(Joi.string(), Joi.number().integer().min(0)).default({}),
}).unknown(false);

// Bulk Invoice Groups > minimal Summary screen - "Save as Draft" (createBulkInvoiceGroup).
// Body is the full previewBulkInvoiceGroup response, echoed back verbatim (it becomes
// bulk_invoice_summary.inv_summary_data as-is, matching legacy's own
// json_encode($param['data'])) - unknown(true) deliberately, unlike every other schema in this
// module, since stripping fields this endpoint doesn't itself read (aaaEntries, allAaaEntries,
// timeExpenseEntries' own per-agency shape, etc.) would silently corrupt what gets stored.
export const bulkInvoiceCreateBodySchema = Joi.object({
  billDateFrom: requiredDateStringSchema,
  billDateTo: dateToNotBeforeFrom("billDateFrom"),
  billingPeriodDateFrom: requiredDateStringSchema,
  billingPeriodDateTo: requiredDateStringSchema,
  cases: Joi.number().integer().min(0).required(),
  caseReferralFee: Joi.number().min(0).precision(2).required(),
  invoicesSummary: Joi.object({ totalInvoiceAmount: Joi.number().required() }).unknown(true).required(),
  timeExpenseEntries: Joi.object().unknown(true).required(),
})
  .unknown(true)
  .required();
