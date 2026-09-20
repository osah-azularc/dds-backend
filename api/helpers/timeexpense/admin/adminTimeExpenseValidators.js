/*
  Created by  : Snehal Narkar
  Date        : 2026-08-21
  Description : Joi validation schemas for the Time & Expense admin endpoints whose
                payloads are small enough to share one file — Billing Roles, Time Entry
                Tasks, Expense Types, Invoice Settings. Billable Agency's schema stays in
                its own file (billableAgencyValidators.js) since it's large enough (three
                conditional contact sections) to warrant it.
*/
import Joi from 'joi';
import { requiredPositiveInt, requiredText, optionalText } from '../../validators.js';

// ── Billing Roles ────────────────────────────────────────────────────────────────
// No inputs are expected on list — .unknown(false) rejects anything unexpected in the body.
export const billingRolesListSchema = Joi.object({}).unknown(false);

export const billingRoleDetailsSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.integer': 'id must be an integer',
    'number.positive': 'id must be a positive number',
  }),
}).unknown(false);

// Matches the frontend's RATE_PER_HOUR_REGEX exactly — kept as a string since
// rate_per_hour is a varchar column, not Joi.number() (would coerce/round and reformat it).
const RATE_PER_HOUR_REGEX = /^\d+(\.\d{1,2})?$/;

const ratePerHourSchema = Joi.string()
  .trim()
  .required()
  .messages({ 'any.required': 'ratePerHour is required' })
  .custom((value, helpers) => {
    if (!RATE_PER_HOUR_REGEX.test(value)) {
      return helpers.message('Enter a valid rate, e.g. 95 or 95.50');
    }
    if (Number(value) <= 0) {
      return helpers.message('Rate per hour must be greater than 0');
    }
    return value;
  });

export const billingRoleUpdateRateSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.integer': 'id must be an integer',
    'number.positive': 'id must be a positive number',
  }),
  ratePerHour: ratePerHourSchema,
}).unknown(false);

// ── Time Entry Tasks ──────────────────────────────────────────────────────────────
// No search filter — matches legacy Angular's client-side filter:search_users; the frontend
// fetches the full list once and filters it locally instead of sending a search term.
export const timeEntryTaskListSchema = Joi.object({}).unknown(false);

export const timeEntryTaskDetailsSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
  }),
}).unknown(false);

export const timeEntryTaskStatusSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
  }),
  statusActiveInActive: Joi.string().valid('0', '1').required().messages({
    'any.only': 'statusActiveInActive must be "0" or "1"',
    'any.required': 'statusActiveInActive is required',
  }),
}).unknown(false);

export const timeEntryTaskSaveSchema = Joi.object({
  // id is omitted entirely on Add (see useTimeEntryTask.js) and a positive int on Edit;
  // .allow(null) is kept as a defensive fallback in case it's ever sent explicitly as null.
  id: Joi.number().integer().positive().allow(null).optional(),
  taskName: requiredText('Task Name'),
  taskAbbreviation: requiredText('Abbreviation'),
  taskDescription: optionalText,
  isBillable: Joi.string().valid('0', '1').required().messages({
    'any.only': 'Billable must be "0" or "1"',
    'any.required': 'Please select Billable',
  }),
}).unknown(false);

// ── Expense Types ─────────────────────────────────────────────────────────────────
// No search filter — same client-side-only search as Time Entry Tasks above.
export const expenseTypeListSchema = Joi.object({}).unknown(false);

export const expenseTypeDetailsSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
  }),
}).unknown(false);

export const expenseTypeStatusSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
  }),
  statusActiveInActive: Joi.string().valid('0', '1').required().messages({
    'any.only': 'statusActiveInActive must be "0" or "1"',
    'any.required': 'statusActiveInActive is required',
  }),
}).unknown(false);

export const expenseTypeSaveSchema = Joi.object({
  // id is omitted entirely on Add (see useExpenseType.js) and a positive int on Edit;
  // .allow(null) is kept as a defensive fallback in case it's ever sent explicitly as null.
  id: Joi.number().integer().positive().allow(null).optional(),
  expenseType: requiredText('Expense Type'),
  description: optionalText,
  isBillable: Joi.string().valid('0', '1').required().messages({
    'any.only': 'Billable must be "0" or "1"',
    'any.required': 'Please select Billable',
  }),
}).unknown(false);

// ── Invoice Settings ──────────────────────────────────────────────────────────────
// Singleton row (id = 1) — no id/list/status params needed.
export const invoiceSettingsDetailsSchema = Joi.object({}).unknown(false);

// Server-side mirror of InvoiceLogoUpload.jsx's dropzone constraints — a non-browser
// client could otherwise bypass them, and this writes a real file to EFS.
const IMAGE_MAX_SIZE_BYTES = 1024 * 1024;
const IMAGE_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const IMAGE_SPECIAL_CHARS_REGEX = /[!@#$%^&*()]/;

const invoiceLogoFileNameSchema = Joi.string()
  .trim()
  .allow('')
  .optional()
  .custom((value, helpers) => {
    if (!value) return value;

    // Reject path separators/traversal outright rather than silently basename-ing them —
    // the file write itself is already safe (writeLogoFile basenames unconditionally), but
    // a rejected filename is clearer than one that's silently renamed on write.
    if (/[/\\]/.test(value) || value.includes('..')) {
      return helpers.message('File name must not contain path separators.');
    }

    if (IMAGE_SPECIAL_CHARS_REGEX.test(value)) {
      return helpers.message(
        'File names should not contain special characters such as: !@#$%^&*().',
      );
    }

    const extension = value.slice(value.lastIndexOf('.')).toLowerCase();
    if (!IMAGE_ALLOWED_EXTENSIONS.has(extension)) {
      return helpers.message('Accepted file types include: png, jpg.');
    }

    return value;
  });

const invoiceLogoBase64Schema = Joi.string()
  .allow('')
  .optional()
  .base64()
  .messages({ 'string.base64': 'Invalid file data.' })
  .custom((value, helpers) => {
    if (!value) return value;

    // Subtract padding chars ('=') for an exact byte count rather than Math.ceil's estimate.
    let paddingLength = 0;
    if (value.endsWith('==')) {
      paddingLength = 2;
    } else if (value.endsWith('=')) {
      paddingLength = 1;
    }
    const sizeInBytes = (value.length * 3) / 4 - paddingLength;
    if (sizeInBytes > IMAGE_MAX_SIZE_BYTES) {
      return helpers.message('Files should be no larger than 1MB.');
    }

    return value;
  });

// Matches legacy: no field is required — UpdateInvoiceDocument() saves blank text fields
// as-is, with no client- or server-side validation blocking the request.
export const invoiceSettingsSaveSchema = Joi.object({
  address: optionalText,
  remitInformation: optionalText,
  tanInformation: optionalText,
  // Both present only when a new logo was picked this save (see useInvoiceSettings.js).
  imageFileName: invoiceLogoFileNameSchema,
  imageBase64: invoiceLogoBase64Schema,
}).unknown(false);
