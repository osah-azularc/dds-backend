import Joi from 'joi';

/**
 * Custom ValidationError class for better error handling
 * @class ValidationError
 * @extends Error
 */
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.isValidationError = true;
  }
}

//common regex
// One optional trailing separator is allowed too (e.g. "O'Neal'"), not just internal ones
// (e.g. "O'Neal") -- matches the frontend's fieldValidation.js exactly.
export const NAME_REGEX = /^\p{L}+(?:[- '’]\p{L}+)*[- '’]?$/u;
export const ID_GENERIC_REGEX = /^[A-Za-z0-9][A-Za-z0-9 _\-/]*$/;
// POSTAL_CODE_US: 5 or 9 digit US zip, optionally with dash (e.g. 30309, 30309-1234).
// Stays text (not number) to preserve leading zeros and the dash.
export const ZIP_CODE_REGEX = /^\d{5}(-\d{4})?$/;
// Fallback email pattern per the field-validation spec (library preferred; this is the
// documented fallback) -- doesn't restrict the TLD's characters or length, so it never blocks
// +tag addresses, long TLDs, or subdomains (e.g. john+tag@sub.agency.gov). Same pattern the
// frontend's fieldValidation.js uses, for byte-for-byte parity.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Date validation schema - accepts MM-DD-YYYY or M-D-YYYY format
export const dateStringSchema = Joi.string()
  .allow('', null)
  .optional()
  .pattern(/^(0?\d|1[0-2])-(0?\d|[12]\d|3[01])-\d{4}$/)
  .messages({
    'string.pattern.base': 'Date must be in MM-DD-YYYY format',
  });

  // Date validation schema - accepts YYYY-MM-DD format
export const dateStringDashboardSchema = Joi.string()
  .allow('', null)
  .optional()
  .pattern(/^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/)
  .messages({
    'string.pattern.base': 'Date must be in YYYY-M-D or YYYY-MM-DD format',
  });

// Month-Year validation schema - accepts "MMM YYYY" format (e.g., "Aug 2024")
export const monthYearSchema = Joi.string()
  .pattern(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{4}$/)
  .messages({
    'string.pattern.base': 'Date must be in "MMM YYYY" format (e.g., "Aug 2024")',
  });

// Array of strings schema (for filters like agency, casetype, judge, etc.)
export const stringArraySchema = Joi.array().items(Joi.string()).optional().default([]);

// Array of numbers schema (for user IDs like clerk, openedBy, closedBy)
export const numberArraySchema = Joi.array().items(Joi.number().integer()).optional().default([]);

// Name validation schema
export const nameSchema = Joi.string()
  .max(50)
  .pattern(NAME_REGEX)
  .required()
  .messages({
    'string.max': 'Name must be at most 50 characters.',
    'string.pattern.base': 'Use letters only. Hyphens and apostrophes are allowed.',
    'any.required': 'Name is required.',
  });

// Generic ID: letters/numbers + space _ - /[Agency Ref #, Citation #, Badge #, License #

export const idGeneric = Joi.string()
  .pattern(ID_GENERIC_REGEX)
  .messages({
    'string.pattern.base':
      'Only letters, numbers, spaces, hyphens, underscores, and slashes are allowed.',
  });

export const agencyReferenceNoSchema = idGeneric
  .max(30)
  .messages({
    'string.max': 'Agency reference number must not exceed 30 characters',
  });

export const boxNoSchema = idGeneric
  .max(30)
  .messages({
    'string.max': 'Box number must not exceed 30 characters',
  });

// Zip code validation schema (POSTAL_CODE_US) - 5 or 9 digit US zip, e.g. 30309, 30309-1234
export const zipCodeSchema = Joi.string()
  .trim()
  .pattern(ZIP_CODE_REGEX)
  .required()
  .messages({
    'string.pattern.base': 'Zip code must be in 30309 or 30309-1234 format.',
    'any.required': 'Zip code is required.',
  });

// Email validation schema (EMAIL) - EMAIL_REGEX per the field-validation spec's documented
// fallback pattern, matching the frontend's fieldValidation.js exactly; length matches RFC
// 5321's 254-char cap. Doesn't lowercase (case-normalizing the domain is optional per spec,
// and the local part is case-sensitive).
export const emailSchema = Joi.string()
  .trim()
  .min(3)
  .max(254)
  .pattern(EMAIL_REGEX)
  .required()
  .messages({
    'string.pattern.base': 'Must be a valid email address.',
    'string.min': 'Email must be at least 3 characters.',
    'string.max': 'Email must not exceed 254 characters.',
    'any.required': 'Email is required.',
  });


function hasAtLeastOneFilterValue(filters) {
  if (!filters) return false;

  return Object.entries(filters).some(([, value]) => {
    // arrays (agency, judge, etc.)
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    // date fields
    if (typeof value === 'string') {
      return value.trim() !== '';
    }

    return false;
  });
}


// ========================================
// SEARCH VALIDATION SCHEMAS
// ========================================

// Custom Joi extension for sanitized strings
// Allows: letters, numbers, spaces, apostrophes (O'Neal), commas (Blitch,IV), periods (Jr.), hyphens (Mary-Jane)
export const sanitizedString = Joi.string().custom((value, helpers) => {
  // Allow alphanumeric, spaces, apostrophes, commas, periods, hyphens, and parentheses
  const allowedPattern = /^[a-zA-Z0-9\s',.()/-]*$/;

  if (!allowedPattern.test(value)) {
    return helpers.message('String contains invalid characters. Only letters, numbers, spaces, apostrophes, commas, periods, hyphens, and parentheses are allowed.');
  }

  // Check for SQL injection patterns
  if (/(--|;|\/\*|\*\/|#|\\)/.test(value)) {
    return helpers.message('String contains potentially unsafe characters.');
  }

  return value;
}, 'Sanitized String Validation');

// Docket number validation schema (numeric only, 1-10 digits)
export const docketNumberSchema = Joi.string()
  .pattern(/^\d{1,10}$/)
  .max(10)
  .messages({
    'string.max': 'Docket number must not exceed 10 digits',
    'string.pattern.base': 'Docket number must contain only digits',
  });

export const starredAction = Joi.number()
  .integer()
  .valid(0, 1)
  .required()
  .messages({
    'number.base': 'Starred action must be a number',
    'any.only': 'Starred action must be 0 or 1',
    'any.required': 'Starred action is required',
  });

export const viewedAction= Joi.number()
  .integer()
  .valid(0, 1)
  .required()
  .messages({
    'number.base': 'Viewed action must be a number',
    'any.only': 'Viewed action must be 0 or 1',
    'any.required': 'Viewed action is required',
  });

export const flag= Joi.string()
  .valid('starred', 'viewed')
  .optional()
  .messages({
    'any.only': 'Flag must be either "starred" or "viewed"',
  });

// Shared by the Time & Expense admin CRUD schemas (Billable Agencies, Time Entry Tasks,
// Expense Types) — previously copy-pasted per-entity.
export const requiredPositiveInt = Joi.number().integer().positive().required();

export const requiredText = (label) =>
  Joi.string().trim().min(1).required().messages({
    'string.empty': `${label} is required`,
    'any.required': `${label} is required`,
  });

export const optionalText = Joi.string().trim().allow('').optional();


export {
  ValidationError,
  hasAtLeastOneFilterValue,
};
