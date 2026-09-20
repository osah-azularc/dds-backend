import Joi from 'joi';

/**
 * Bulk Upload Common Helpers
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Shared utilities used across CSS, CSS PAT-E, OIG EBT, and DFCS bulk upload
 * services. Per-agency constants and CSV row mappers live in their dedicated
 * *Helpers.js modules.
 */

// Error messages - shared across all bulk upload agencies
export const ERROR_MESSAGES = {
  DUPLICATE: (refno) => `Duplicate: Ref# ${refno} already has an open docket`,
  MANDATORY_FIELDS: (missingFields) => `Missing required fields: ${missingFields.join(', ')}`,
  VALIDATION_ERRORS: (errors) => errors.join(', '),
  JUDGE_NOT_FOUND: (name) => `Judge not found: ${name}`,
  LOCATION_NOT_FOUND: (name) => `Hearing location not found: ${name}`,
  INVALID_DATE_FORMAT: (error) => `Invalid hearing date: ${error}`,
  DOCKET_FAILED: (msg) => `Failed to create docket: ${msg}`,
  INVALID_CSV: 'Incorrect Header and CSV, Please download the correct csv',
  // Legacy's DFCS-specific wording says "upload" instead of "download" (uploadDfcsMAction,
  // OsahformController.php:9023) — CSS EST/OIG EBT's legacy code says "download" (the shared
  // INVALID_CSV message above). Kept as separate, deliberate per-agency text, not a typo.
  INVALID_CSV_DFCS: 'Incorrect Header and CSV, Please upload the correct csv',
  // Legacy: header-row-only CSVs get a distinct "empty file" signal (OsahformController.php:
  // 11058-11072, emptyCheck) rather than silently reporting 0 found / 0 processed as success.
  EMPTY_CSV: 'The uploaded CSV has no data rows (only a header row was found). Please add at least one row and try again.',
  // Legacy wording, verbatim (OsahformController.php:9523, 11364, uploadDfcsMAction) — a single
  // generic message for the row regardless of which email field(s) are invalid, not field-specific.
  INVALID_EMAIL: 'Please correct the email format.',
};

/**
 * Create error record matching CSV headers for error report
 * @param {Array} csvRowArray - Original CSV row array
 * @param {Array} headerArray - CSV header array
 * @param {string} errorMessage - Error message to include
 * @returns {Object} Error record object with all CSV fields plus error_msg
 */
export function createErrorRecord(csvRowArray, headerArray, errorMessage) {
  const record = {};
  headerArray.forEach((header, index) => {
    record[header] = csvRowArray[index] || '';
  });
  record.error_msg = errorMessage;
  return record;
}

/**
 * Trim unicode characters from string (equivalent to PHP utf8_encode cleanup)
 * @param {string} str - Input string to clean
 * @returns {string} Cleaned string with unicode BOM and zero-width characters removed
 */
export function trimUniCodeChar(str) {
  if (!str) return '';
  return str.toString().trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
}

/**
 * Normalize a value into a case-insensitive lookup-map key (judge, hearing location,
 * agency, case code, county). Comparison-only - callers use the matched Map entry's own
 * *value* (the DB record's canonical text) for anything stored/displayed, never this key
 * itself, so a CSV casing difference is tolerated on lookup without a mismatched-case
 * value ever landing in the database.
 */
export function normalizeKey(str) {
  return (str ?? '').toString().trim().toUpperCase();
}

// ASCII-only, RFC 5322-ish local part + hostname-label domain. Deliberately stricter than
// "anything without a space or @" — that let malformed/mis-encoded input (e.g. a stray
// non-ASCII byte pasted in from Excel) through as "valid", which then blew up downstream
// as a raw MySQL collation-conversion error instead of a validation message. Mirrors PHP's
// filter_var(..., FILTER_VALIDATE_EMAIL) closely enough for legacy parity here.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validate an email address against the ASCII/RFC-5322-ish pattern above. Shared by
 * DfcsBulkUploadService and DfcsMissingDocService (both validate the same three
 * optional email fields — petitioner / petitioner attorney / petitioner rep).
 */
export function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

/**
 * Title-case every word in a string (capitalize each word's first letter, lowercase
 * the rest of that word). Word boundaries (\b) also trigger after non-letter
 * characters like spaces, hyphens, and apostrophes, so multi-part names are handled
 * correctly — e.g. "SHAKARA M." -> "Shakara M.", "mary-jane" -> "Mary-Jane",
 * "o'brien" -> "O'Brien". A plain single word behaves the same as before
 * (e.g. "MCDONALD" -> "Mcdonald" — no dictionary of surname exceptions).
 */
export function capitalizeFirst(str) {
  if (!str) return '';
  return str.toString().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Joi schema for CSV hearing date validation
 * Accepts MM-DD-YYYY or MM/DD/YYYY format (with optional leading zeros)
 * Pattern from: ecourt-upgrades/backend/api/helpers/validators.js
 */
export const csvHearingDateSchema = Joi.string()
  .required()
  .pattern(/^(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/]\d{4}$/)
  .messages({
    'string.empty': 'Hearing Date is required',
    'string.pattern.base': 'Hearing Date must be in MM-DD-YYYY or MM/DD/YYYY format',
    'any.required': 'Hearing Date is required',
  });

/**
 * Validate hearing date format using Joi
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateHearingDateFormat(dateStr) {
  const { error } = csvHearingDateSchema.validate(dateStr);
  if (error) {
    return { valid: false, error: error.details[0].message };
  }
  return { valid: true };
}

/**
 * Parse hearing date from CSV format (MM-DD-YYYY or MM/DD/YYYY) to MySQL format (YYYY-MM-DD)
 */
export function parseHearingDate(dateStr) {
  if (!dateStr) return null;
  const dateParts = dateStr.includes('-') ? dateStr.split('-') : dateStr.split('/');
  if (dateParts.length === 3) {
    return `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`;
  }
  return null;
}

/**
 * Parse hearing time from CSV format to MySQL format (handles 12:00 AM edge case)
 * Returns '00:00:00' when empty, matching legacy PHP behavior (date("H:i:s") default)
 */
export function parseHearingTime(timeStr) {
  if (!timeStr) return '00:00:00';
  if (timeStr === '12:00 AM') return '00:00:01';
  try {
    return new Date(`1970-01-01 ${timeStr}`).toTimeString().split(' ')[0];
  } catch {
    return '00:00:00';
  }
}

/**
 * Parse county from CSV and capitalize
 */
export function parseCounty(countyStr) {
  return capitalizeFirst(trimUniCodeChar(countyStr));
}

/**
 * Check e-services status for a party from publicaccess_users table
 * @param {Object} PublicAccessUser - Sequelize model
 * @param {string} firstName - Party first name
 * @param {string} lastName - Party last name
 * @param {string} [email] - Optional email for more precise lookup
 * @returns {Promise<string>} e-services status ('0' or '1')
 */
export async function checkEServicesStatus(PublicAccessUser, firstName, lastName, email) {
  if (!firstName || !lastName) return '0';
  try {
    const whereClause = { firstName, lastName };
    if (email) whereClause.email = email;
    const publicUser = await PublicAccessUser.findOne({
      where: whereClause,
      attributes: ['eServices'],
    });
    return publicUser?.eServices || '0';
  } catch {
    return '0';
  }
}

