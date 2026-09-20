import Joi from 'joi';
import moment from 'moment';
import {ValidationError, hasAtLeastOneFilterValue,  nameSchema, agencyReferenceNoSchema, boxNoSchema, dateStringDashboardSchema } from './validators.js';

// Dropdown values come from controlled lists — accept any string up to a sane
// max length and skip pattern checks so every list option is allowed.
const dropdownString = Joi.string().max(500);


// ========================================
// SEARCH VALIDATION SCHEMAS
// ========================================

// Docket number validation schema (numeric only, 1-10 digits)
const docketNumberSchema = Joi.string()
  .pattern(/^\d{1,10}$/)
  .max(10)
  .messages({
    'string.max': 'Docket number must not exceed 10 digits',
    'string.pattern.base': 'Docket number must contain only digits',
  });

// General Search validation schema
const generalSearchConditionSchema = Joi.object({
  // Text fields
  lastName: nameSchema.allow('').optional(),
  firstName: nameSchema.allow('').optional(),
  agencyRefNumber: agencyReferenceNoSchema.allow('').optional(),

  // Single-select dropdown fields (camelCase matching Sequelize models)
  typeOfContact: dropdownString.allow('',null).optional(),
  status: dropdownString.allow('',null).optional(),
  statusNotIn: Joi.array().items(dropdownString).optional(),
  judge: dropdownString.allow('',null).optional(),
  judgeAssistant: dropdownString.allow('', null).optional(),
  staffAttorney: dropdownString.allow('', null).optional(),
  hearingSite: dropdownString.allow('', null).optional(),
  hearingType: dropdownString.allow('', null).optional(),
  hearingTime: dropdownString.allow('', null).optional(),

  // Special filters for dashboard widgets
  excludeNOH: Joi.boolean().optional(),
  telv_o_five: Joi.string().valid('0', '1').optional(),
  flag: Joi.string().valid('1', '2', '5').optional(),

  // Multi-select dropdown fields (camelCase matching Sequelize models)
  county: Joi.array().items(dropdownString).optional().default([]),
  refAgency: Joi.array().items(dropdownString).optional().default([]),
  caseType: Joi.array().items(dropdownString).optional().default([]),

  // Date range fields (camelCase with suffix)
  hearingDateFrom: dateStringDashboardSchema,
  hearingDateTo: dateStringDashboardSchema,
  dateReceivedByOSAHFrom: dateStringDashboardSchema,
  dateReceivedByOSAHTo: dateStringDashboardSchema,
  dateRequestedFrom: dateStringDashboardSchema,
  dateRequestedTo: dateStringDashboardSchema,

  // Case IDs filter (for viewing specific dockets, e.g., after bulk edit)
  caseIds: Joi.array().items(Joi.number().integer().positive()).optional(),

  // Special flags for dashboard filters
  withoutNOH: Joi.boolean().optional(),
  withDecisionDocument: Joi.boolean().optional(),
  fromUpcomingCalendar: Joi.boolean().optional(),
  fromDocketsReceived: Joi.boolean().optional(),
  fromOpenCasesWithDecision: Joi.boolean().optional(),
}).unknown(false); // ✅ Reject unknown fields - only allow fields present in frontend

// Closed Cases Search validation schema
const closedCasesSearchConditionSchema = Joi.object({
  // Required date range
  dateClosedFrom: dateStringDashboardSchema
    .required()
    .disallow('', null)
    .messages({
      'string.pattern.base': 'Please select date closed by OSAH(From)!',
    }),

  dateClosedTo: dateStringDashboardSchema
    .required()
    .disallow('', null)
    .messages({
      'string.pattern.base': 'Please select date closed by OSAH(To)!',
    }),

  // Optional filters (camelCase matching Sequelize models)
  judge: dropdownString.allow('').optional(),
  boxNo: boxNoSchema.allow('').optional(),

  // Multi-select dropdown fields (camelCase matching Sequelize models)
  agency: Joi.array().items(dropdownString).optional().default([]),
  caseType: Joi.array().items(dropdownString).optional().default([]),
  county: Joi.array().items(dropdownString).optional().default([]),
}).unknown(false); // ✅ Reject unknown fields - only allow fields present in frontend

// Pagination and sorting - no validation needed, pass through as-is
// The controller will handle these parameters directly

// Docket Info Search validation schema
const docketInfoSearchSchema = Joi.object({
  tableName: Joi.string().valid('docketsearch').required().messages({
    'any.required': 'Table name is required',
    'any.only': 'Invalid table name. Must be "docketsearch"',
  }),
  docketnumber: Joi.string()
    .trim()
    .max(255)
    .optional()
    .messages({
      'string.max': 'Docket number is too long',
    }),
})
  .or('docketnumber')
  .unknown(false);

// Complete General Search validation schema
const generalSearchSchema = Joi.object({
  tableName: Joi.string().optional(), // Allow tableName but don't validate it
  condition: generalSearchConditionSchema.optional().default({}),
  additionalCondition: Joi.object().optional().default({}), // No validation, pass through
}).unknown(true); // Allow unknown fields for flexibility

// Complete Closed Cases Search validation schema
const closedCasesSearchSchema = Joi.object({
  condition: closedCasesSearchConditionSchema.required(),
  additionalCondition: Joi.object().optional().default({}), // No validation, pass through
}).unknown(true); // Allow unknown fields for flexibility

// ========================================
// SEARCH VALIDATION FUNCTIONS
// ========================================

/**
 * Validate docket number
 * @param {string} docketNo - Docket number to validate
 * @returns {Object} - Validated and sanitized docket number
 */
function validateDocketNumber(docketNo) {
  const { error, value } = docketNumberSchema.validate(docketNo, { abortEarly: false });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'docketNumber');
  }
  return value;
}

/**
 * Validate general search request
 * @param {Object} data - Request body containing condition and additionalCondition
 * @returns {Object} - Validated and sanitized search parameters
 */
const assertValidDateRange = (from, to, message, contextKey) => {
	  const fromDate = moment(from, 'YYYY-MM-DD');
	  const toDate = moment(to, 'YYYY-MM-DD');
	  if (fromDate.isValid() && toDate.isValid() && fromDate.isAfter(toDate)) {
	    throw new ValidationError(message, contextKey);
	  }
};

function validateGeneralSearch(data) {
	  const { error, value } = generalSearchSchema.validate(data, { abortEarly: false, stripUnknown: true });
	  if (error) {
	    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'generalSearch');
	  }

	  // 🔴 MAIN RULE: at least one filter must be selected
	  const condition = value.condition || {};
	  if (!hasAtLeastOneFilterValue(condition)) {
	    throw new ValidationError(
	      'Please select at least one filter to perform search',
	      'generalSearch',
	    );
	  }

	  // ✅ Additional validation: Check date ranges
	  if (condition.hearingDateFrom && condition.hearingDateTo) {
	    assertValidDateRange(
	      condition.hearingDateFrom,
	      condition.hearingDateTo,
	      'Hearings Date From should not be greater than Hearing Date To',
	      'generalSearch',
	    );
	  }

	  if (condition.dateReceivedByOSAHFrom && condition.dateReceivedByOSAHTo) {
	    assertValidDateRange(
	      condition.dateReceivedByOSAHFrom,
	      condition.dateReceivedByOSAHTo,
	      'Date Received From should not be greater than Date Received To',
	      'generalSearch',
	    );
	  }

	  if (condition.dateRequestedFrom && condition.dateRequestedTo) {
	    assertValidDateRange(
	      condition.dateRequestedFrom,
	      condition.dateRequestedTo,
	      'Date Requested From should not be greater than Date Requested To',
	      'generalSearch',
	    );
	  }

	  return value;
}

/**
 * Validate closed cases search request
 * @param {Object} data - Request body containing condition and additionalCondition
 * @returns {Object} - Validated and sanitized search parameters
 */
function validateClosedCasesSearch(data) {
  const { error, value } = closedCasesSearchSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'closedCasesSearch');
  }

  // Additional validation: Check date range
  const condition = value.condition || {};
  if (condition.dateClosedFrom && condition.dateClosedTo) {
    const fromDate = moment(condition.dateClosedFrom, 'YYYY-MM-DD');
    const toDate = moment(condition.dateClosedTo, 'YYYY-MM-DD');
    if (fromDate.isValid() && toDate.isValid() && fromDate.isAfter(toDate)) {
      throw new ValidationError('Date Closed From should not be greater than Date Closed To', 'closedCasesSearch');
    }
  }

  return value;
}

/**
 * Validate docket info search request
 * @param {Object} data - Request body containing tableName and condition
 * @returns {Object} - Validated and sanitized search parameters
 */
function validateDocketInfoSearch(data) {
  const { error, value } = docketInfoSearchSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'docketInfoSearch');
  }
  return value;
}

export {
	  // Search validation functions
	  validateDocketNumber,
	  validateGeneralSearch,
	  validateClosedCasesSearch,
	  validateDocketInfoSearch,
	  // Search validation schemas
	  generalSearchSchema,
	  closedCasesSearchSchema,
	  docketInfoSearchSchema,
};

