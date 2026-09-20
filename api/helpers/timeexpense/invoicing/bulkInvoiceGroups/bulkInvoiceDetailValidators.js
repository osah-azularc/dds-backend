import Joi from "joi";
import { dateStringDashboardSchema } from "../../../validators.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail screens (Summary/Billable Activity/Invoices
 * tabs for an already-created group, bulkInvoiceDetailController.js) body/query
 * schemas - split out of invoicingValidators.js to keep that file under the
 * 300-line guideline, same rationale as bulkInvoiceCreateValidators.js's own
 * split. Use with invoicingValidators.js's own validateBody/validateQuery/
 * validateParams middleware factories, same as every other schema in this module.
 */

// time_entry_billable_agency.id / judge_assistant_clerk.user_id style filters - blank or a
// positive integer. Duplicated from invoicingValidators.js's own private idFilterSchema (not
// exported there) rather than reaching into that file's internals.
const idFilterSchema = Joi.alternatives()
  .try(Joi.string().valid(""), Joi.number().integer().positive())
  .optional()
  .default("");

// Billable Activity tab - stateless, driven entirely by whatever timeExpenseEntries/date range
// the caller already has in memory (see bulkInvoiceDetailController.js's own comment), not
// looked up by a stored group id.
export const bulkInvoiceGroupBillableActivityBodySchema = Joi.object({
  timeExpenseEntries: Joi.object().pattern(Joi.string(), Joi.object().unknown(true)).required(),
  billDateFrom: dateStringDashboardSchema,
  billDateTo: dateStringDashboardSchema,
  agencyId: idFilterSchema,
  employee: idFilterSchema,
  page: Joi.number().integer().min(0).optional().default(0),
  pageSize: Joi.number().integer().min(1).max(500).optional().default(50),
}).unknown(false);
