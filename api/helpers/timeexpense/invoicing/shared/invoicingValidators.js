import Joi from "joi";
import { dateStringDashboardSchema } from "../../../validators.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 12-08-2026
 * @description
 * Joi query-param validation schemas + Express middleware for the Invoicing
 * module's list endpoints (Invoices, Billable Activity, Bulk Invoice Groups).
 */

const pageSchema = Joi.number().integer().min(0).optional().default(0);
const pageSizeSchema = Joi.number().integer().min(1).max(100).optional().default(10);
const orderSchema = Joi.string().valid("asc", "desc", "ASC", "DESC").optional().default("desc");
const searchSchema = Joi.string().trim().max(255).allow("").optional().default("");
// time_entry_billable_agency.id / judge_assistant_clerk.user_id style filters - blank or a
// positive integer.
const idFilterSchema = Joi.alternatives()
  .try(Joi.string().valid(""), Joi.number().integer().positive())
  .optional()
  .default("");

export const invoiceListQuerySchema = Joi.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: searchSchema,
  status: Joi.alternatives()
    .try(Joi.string().valid(""), Joi.number().integer().min(2).max(7))
    .optional()
    .default(""),
  agency: idFilterSchema,
  invoiceDateFrom: dateStringDashboardSchema,
  invoiceDateTo: dateStringDashboardSchema,
  dueDateFrom: dateStringDashboardSchema,
  dueDateTo: dateStringDashboardSchema,
  orderby: Joi.string().valid("id", "invDate").optional().default("id"),
  order: orderSchema,
}).unknown(false);

export const agencyListQuerySchema = Joi.object({}).unknown(false);

export const billableActivityListQuerySchema = Joi.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  billDateFrom: dateStringDashboardSchema,
  billDateTo: dateStringDashboardSchema,
  employee: idFilterSchema,
  agencyId: idFilterSchema,
}).unknown(false);

export const employeeListQuerySchema = Joi.object({}).unknown(false);

export const itemCatalogQuerySchema = Joi.object({}).unknown(false);
export const professionalListQuerySchema = Joi.object({}).unknown(false);
export const roleListQuerySchema = Joi.object({}).unknown(false);

export const professionalIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

// Manual Invoice line item - one of three shapes:
//   - Case Referral Fee (itemType 'other', the only manual entry with no Professional field -
//     checkAllLineItems sets it to the 9999 sentinel, see MANUAL_ITEM_PROFESSIONAL)
//   - a catalog task/expense-type entry (itemType 'time'/'expense', typed-in-manually against
//     the item-catalog list - see itemCatalogHelpers.js)
//   - a billable-activity-sourced entry (itemType 'time'/'expense', billable: true, picked via
//     Add Billable Activity - itemCode is a real time_entry/expense_entry.id, not a catalog id).
//     professional/quantity/rate aren't trusted from the client for these - the backend
//     re-resolves them server-side (billableLinkageHelpers.js's resolveBillableItemDetails), so
//     they're accepted-but-optional here rather than required.
const manualInvoiceItemSchema = Joi.object({
  itemType: Joi.string().valid("other", "time", "expense").required(),
  // Only a catalog/manual 'time'/'expense' row can be billable - 'other' (Case Referral Fee)
  // never is.
  billable: Joi.boolean()
    .optional()
    .default(false)
    .when("itemType", { is: "other", then: Joi.valid(false) }),
  // 'other' is restricted to 1 (Case Referral Fee) - id 2 ("All Agencies - Administrative")
  // is commented out/unreachable in legacy's own template, so never a valid submission either.
  // For a billable item this is the source time_entry/expense_entry.id, not a catalog id - no
  // extra restriction needed, resolveBillableItemDetails rejects an id with no matching row.
  itemCode: Joi.number()
    .integer()
    .positive()
    .required()
    .when("itemType", { is: "other", then: Joi.valid(1) }),
  // Required for a manually-typed time/expense catalog item (validateEachItem's 'time'/
  // 'expense' cases both require it - for AAA time items this actually holds a
  // time_entry_billing_roles.id, not a judge_assistant_clerk.user_id, since the same ng-model
  // backs both the Professional and Role selects). Omitted/null for 'other' items - the backend
  // fills in the 9999 sentinel itself. Optional for a billable item - server-resolved, not
  // client-trusted.
  professional: Joi.number()
    .integer()
    .positive()
    .when("billable", {
      is: true,
      then: Joi.optional(),
      otherwise: Joi.when("itemType", {
        is: "other",
        then: Joi.optional().allow(null),
        otherwise: Joi.required(),
      }),
    }),
  quantity: Joi.number()
    .min(0)
    .when("billable", { is: true, then: Joi.optional().allow(null), otherwise: Joi.required() }),
  rate: Joi.number()
    .min(0)
    // .allow(null): a billable item's rate can genuinely resolve to null client-side (e.g. a
    // professional with no hourly-rate mapping - see manualInvoiceValidation.js's own doc
    // comment on this), and the frontend sends that through as a literal null, not an omitted
    // key - Joi.optional() alone only tolerates the key being absent/undefined, not present-and-
    // null, so without this a same-shaped payload legacy would silently accept 400s here instead.
    .when("billable", { is: true, then: Joi.optional().allow(null), otherwise: Joi.required() }),
});

export const saveManualInvoiceBodySchema = Joi.object({
  agencyId: Joi.number().integer().positive().required(),
  email: Joi.string().trim().max(255).required(),
  billDateFrom: dateStringDashboardSchema,
  billDateTo: dateStringDashboardSchema,
  invoiceDate: dateStringDashboardSchema.required().disallow("", null),
  days: Joi.number().integer().valid(15, 30, 60, 90).required(),
  memo: Joi.string().trim().max(1000).allow("").optional().default(""),
  // .precision(2) added 2026-08-28 to match partialPaymentBodySchema's paymentAmount - discount
  // was the one money field in this schema with no decimal-place cap (legacy has none either; see
  // MONEY-CONVENTIONS.md's sibling discussion), so a >2-decimal value was previously silently
  // rounded/truncated by invoices.discount's DECIMAL(10,2) column with no validation error, unlike
  // every other money field in this form.
  discount: Joi.number().min(0).precision(2).optional().default(0),
  discountDesc: Joi.string().trim().max(500).allow("").optional().default(""),
  remitInformation: Joi.string().trim().max(1000).allow("").optional().default(""),
  taxInformation: Joi.string().trim().max(1000).allow("").optional().default(""),
  address: Joi.string().trim().max(1000).allow("").optional().default(""),
  items: Joi.array().items(manualInvoiceItemSchema).min(1).required(),
  // true = "Send Invoice" (status lands on 5/Unpaid, PDF generated + emailed after save);
  // false/omitted = "Save Draft" (status 2). Matches legacy's own sendInvoiceStatus field name.
  sendInvoiceStatus: Joi.boolean().optional().default(false),
}).unknown(false);

// Same shape as a save/update body, minus sendInvoiceStatus - preview never sends anything, it
// only renders a PDF from the form's current (unsaved) values.
export const previewInvoicePdfBodySchema = saveManualInvoiceBodySchema.keys({
  sendInvoiceStatus: Joi.forbidden(),
});

export const remitDetailsQuerySchema = Joi.object({}).unknown(false);

// View/Edit Invoice - :id route param.
export const invoiceIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
}).unknown(false);

// Invoice Listing's paperclip/Attach Files feature (invoiceAttachmentsController.js) - the
// per-attachment routes (:id/attachments/:attachmentId/...).
export const invoiceAttachmentIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  attachmentId: Joi.number().integer().positive().required(),
}).unknown(false);

// Invoice Listing actions menu - Add Partial Payment (invoiceActionsController.js's
// addPartialPayment). Mirrors legacy's addPartialPaymentForm client checks (paymentAmount/
// paymentDate both required, amount capped at 2 decimals - legacy's checkDecimals truncates a
// longer input rather than rejecting it, but the backend must not just trust whatever precision
// the client claims to have already enforced) plus one deliberate improvement: legacy's own
// check (`paymentAmount == '' || paymentAmount == null`) lets a literal 0 or a negative amount
// through silently (the onkeyup negative-flip only fires on real keystrokes, not a scripted/
// replayed submission) - `.positive()` closes that gap rather than reproducing it, since it's an
// obvious missing guard, not a meaningful business rule (unlike this module's other preserved
// quirks).
export const partialPaymentBodySchema = Joi.object({
  paymentAmount: Joi.number().positive().precision(2).required(),
  paymentDate: dateStringDashboardSchema.required().disallow("", null),
  memo: Joi.string().trim().max(1000).allow("").optional().default(""),
}).unknown(false);

// Invoice Listing actions menu - Write Off Balance (invoiceActionsController.js's
// writeOffBalance). Mirrors legacy's saveWriteOff client check (reason required, textarea
// maxlength=1000).
export const writeOffBodySchema = Joi.object({
  reason: Joi.string().trim().min(1).max(1000).required(),
}).unknown(false);

// View Invoice's payment-history row edit/delete (invoicePartialPaymentController.js) - the
// :id/:paymentId route param pair, same shape as invoiceAttachmentIdParamSchema.
export const invoicePaymentIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  paymentId: Joi.number().integer().positive().required(),
}).unknown(false);

// View Invoice's payment-history row "Update" (invoicePartialPaymentController.js's
// updatePartialPayment). Deliberately has no paymentDate field, unlike partialPaymentBodySchema
// above - traced legacy's updatePartialPaymentAction in full: it accepts an edited paymentDate
// from the form but never actually uses it, always stamping the payment row with today's date
// instead. That's real, confirmed legacy behavior (not a copy-paste artifact like the attachment
// module's agency_id=1 was), so it's reproduced as-is rather than "fixed" - see the controller's
// own comment for the server-side stamping this schema's absence of paymentDate implies.
export const updatePartialPaymentBodySchema = Joi.object({
  paymentAmount: Joi.number().positive().precision(2).required(),
  memo: Joi.string().trim().max(1000).allow("").optional().default(""),
}).unknown(false);

// Invoice Listing's top-level bulk Actions dropdown (Resend invoice / Mark as Paid / Download) -
// invoiceBulkActionsController.js. Mirrors legacy's invoiceCheked.selected/paid (an array of
// invoices.id, already filtered client-side to drop Draft-status ids - see
// InvoiceListFilters.jsx's Draft-block/Paid-skip logic, ported from performBulkInvoiceAction).
export const bulkInvoiceIdsBodySchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
}).unknown(false);

export const bulkInvoiceListQuerySchema = Joi.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: searchSchema,
  status: Joi.string().valid("", "1", "2", "3").optional().default(""),
  createdDateFrom: dateStringDashboardSchema,
  createdDateTo: dateStringDashboardSchema,
  orderby: Joi.string().valid("id", "createdAt").optional().default("id"),
  order: orderSchema,
}).unknown(false);

// Bulk Invoice Groups > Create Bulk Invoice / minimal Summary screen body schemas
// (bulkInvoicePreviewBodySchema / bulkInvoiceCreateBodySchema) live in
// bulkInvoiceCreateValidators.js, and the group-detail screens' own schemas
// (bulkInvoiceGroupBillableActivityBodySchema) live in bulkInvoiceDetailValidators.js - not
// here, kept this file under the 300-line guideline.

/**
 * @description
 * Express middleware factory - validates req.query against the given schema,
 * replacing it with the sanitized value on success, or responds 400.
 * @param {*} schema
 */
export const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, { abortEarly: false, stripUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      })),
      status: 400,
    });
  }

  req.query = value;
  return next();
};

/**
 * @description
 * Express middleware factory - validates req.body against the given schema,
 * replacing it with the sanitized value on success, or responds 400.
 * @param {*} schema
 */
export const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      })),
      status: 400,
    });
  }

  req.body = value;
  return next();
};

/**
 * @description
 * Express middleware factory - validates req.params against the given schema,
 * replacing it with the sanitized value on success, or responds 400.
 * @param {*} schema
 */
export const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, { abortEarly: false, stripUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      })),
      status: 400,
    });
  }

  req.params = value;
  return next();
};
