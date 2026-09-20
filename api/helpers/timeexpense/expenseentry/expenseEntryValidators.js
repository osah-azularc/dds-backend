import Joi from "joi";
import { dateStringDashboardSchema, dateStringSchema, requiredPositiveInt } from "../../validators.js";

/**
 * @module
 * @description
 * Query validation schemas for the Expense Entry screen (Time & Expense >
 * Expenses page, ecourt-frontend ExpenseEntry.jsx) - both the filter-dropdown
 * reference-data endpoints (Employee, Expense Type, Agency) and the paginated
 * list endpoint.
 */

// The three reference-data endpoints take no query params (matches legacy
// TimeExpenseController::getAllTasksAgencyAction, which built all of them off one
// parameterless request) - kept as separate named schemas per this project's existing
// convention rather than one shared schema (see invoicingValidators.js's
// agencyListQuerySchema / employeeListQuerySchema / professionalListQuerySchema, all equally
// empty), so each route's validateQuery call stays self-documenting if params are ever added to
// just one of them.
export const expenseEntryEmployeeListQuerySchema = Joi.object({}).unknown(false);
export const expenseEntryExpenseTypeListQuerySchema = Joi.object({}).unknown(false);
export const expenseEntryAgencyListQuerySchema = Joi.object({}).unknown(false);
export const expenseEntryLocationListQuerySchema = Joi.object({}).unknown(false);

// expense_entry.user_id / .expense_type_id style filters - blank or a positive integer. Matches
// invoicingValidators.js's own idFilterSchema (duplicated locally rather than imported cross-
// domain, per this project's existing per-domain-validators convention).
const idFilterSchema = Joi.alternatives()
  .try(Joi.string().valid(""), Joi.number().integer().positive())
  .optional()
  .default("");

// The General Search filters getExpenseEntryList and exportExpenseEntries both take - employee/
// expenseType are exact-match ids, status is expense_entry.is_posted (only '1'/'2' are reachable
// from the Status filter dropdown today, but the column itself is a '0'-'3' ENUM, so the schema
// stays as permissive as the underlying data), agency is a free-text LIKE match (not an id -
// legacy filters agency_work_type by its description text, not time_entry_billable_agency.id),
// and dateFrom/dateTo bound date_incurred. Shared so the two schemas can't quietly drift apart.
const expenseEntryFilterFields = {
  employee: idFilterSchema,
  status: Joi.string().valid("", "0", "1", "2", "3").optional().default(""),
  expenseType: idFilterSchema,
  agency: Joi.string().trim().max(255).allow("").optional().default(""),
  dateFrom: dateStringDashboardSchema,
  dateTo: dateStringDashboardSchema,
};

export const expenseEntryListQuerySchema = Joi.object({
  page: Joi.number().integer().min(0).optional().default(0),
  pageSize: Joi.number().integer().min(1).max(100).optional().default(10),
  ...expenseEntryFilterFields,
}).unknown(false);

// Same filters as the list, no pagination - matches legacy's own exportExpenseDataAction, which
// always exports every matching row in one file.
export const expenseEntryExportQuerySchema = Joi.object({
  ...expenseEntryFilterFields,
}).unknown(false);

// expense_entry.expense_id - the business id the Edit/View modal's URL param and legacy's own
// getExpenseEntryByIdAction both key on, not expense_entry.id (its actual PK - see
// ExpenseEntry.js's own doc comment on why the two differ).
export const expenseEntryIdParamSchema = Joi.object({
  expenseId: Joi.number().integer().positive().required(),
}).unknown(false);

// Matches the New/Edit Expense modal's 4 mandatory fields exactly - legacy's own
// validateExpenseEntry() (expenseentrycontroller.js) checks only Employee, Expense Type,
// Agency, Transaction Amount before allowing a submit (the phtml's own `*` markers agree: Date
// Incurred, Location, Description have none). expenseId's presence is what routes
// saveExpenseEntry between addExpenseEntryAction and editExpenseentryFormAction's legacy
// behavior - see that controller's own doc comment.
export const expenseEntrySaveBodySchema = Joi.object({
  expenseId: Joi.number().integer().positive().optional(),
  user: requiredPositiveInt.messages({
    "any.required": "Please select Employee",
    "number.base": "Please select Employee",
  }),
  task: requiredPositiveInt.messages({
    "any.required": "Please select Expense Type",
    "number.base": "Please select Expense Type",
  }),
  agency: Joi.array().items(Joi.string()).min(1).required().messages({
    "array.min": "Please select Agency",
    "any.required": "Please select Agency",
  }),
  agencyCode: Joi.array().items(Joi.string()).optional(),
  agencies: Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number())).optional(),
  dateIncurred: dateStringSchema,
  location: Joi.alternatives().try(Joi.string().valid(""), Joi.number().integer().positive()).optional(),
  amount: Joi.number().min(0).required().messages({
    "any.required": "Please enter Transaction Amount",
    "number.base": "Please enter Transaction Amount",
  }),
  description: Joi.string().trim().allow("").optional(),
  roundedAmount: Joi.number().required(),
  differenceAmount: Joi.number().required(),
  totalRoundedAmount: Joi.number().required(),
}).unknown(false);
