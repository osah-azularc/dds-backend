import Joi from 'joi';
import { ValidationError, dateStringDashboardSchema, docketNumberSchema, agencyReferenceNoSchema } from './validators.js';
/*
  Created by  : Snehal Narkar
  Date        : 2026-03-25
  Description : Joi validation schemas and functions for all OSAH Form 1 routes.
                Follows the same pattern as reportValidators.js / dashboardValidators.js.
*/

// ── Reusable primitives ───────────────────────────────────────────────────────
const positiveInt = Joi.number().integer().positive();
const requiredPositiveInt = positiveInt.required();

// Dropdown values come from controlled lists — accept any string up to a sane
// max length and skip pattern checks so every list option is allowed.
const dropdownString = Joi.string().max(500);

// Date string (YYYY-MM-DD) that rejects future dates.
// Standalone schema — not chained off dateStringDashboardSchema to avoid Joi
// message-inheritance issues. helpers.message() sets the error inline so no
// separate .messages({ 'date.future': ... }) entry is needed.
const pastOrTodayDateString = Joi.string()
  .allow('', null)
  .optional()
  .pattern(/^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/)
  .custom((value, helpers) => {
    if (!value) return value; // empty / null already handled by allow()
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    if (value > today) return helpers.message('{{#label}} cannot be a future date');
    return value;
  })
  .messages({
    'string.pattern.base': 'Date must be in YYYY-MM-DD format',
  });

// ── getHearingInfoForDocket ───────────────────────────────────────────────────
// casetypeId and countyId arrive as numeric strings ("606", "3") because Angular/PHP
// read them from HTML data-attributes which are always strings. React now matches
// that behaviour. docketNumberSchema (from validators.js) validates /^\d{1,10}$/.
const numericString = docketNumberSchema;
const requiredNumericString = numericString.required();
const optionalNumericString = requiredNumericString.allow('').optional();

const getHearingInfoForDocketSchema = Joi.object({
  casetypeId: requiredNumericString.messages({
    'any.required': 'casetypeId is required',
    'string.pattern.base': 'casetypeId must be a numeric string',
  }),
  countyId: requiredNumericString.messages({
    'any.required': 'countyId is required',
    'string.pattern.base': 'countyId must be a numeric string',
  }),
}).unknown(false);

// ── checkSkipHearing ─────────────────────────────────────────────────────────
// casetypeId is sent as a numeric string (same convention as getHearingInfoForDocket).
const checkSkipHearingSchema = Joi.object({
  casetypeId: requiredNumericString.messages({
    'any.required': 'casetypeId is required',
    'string.pattern.base': 'casetypeId must be a numeric string',
  }),
}).unknown(false);

// ── getConfidentialCaseType ───────────────────────────────────────────────────
const getConfidentialCaseTypeSchema = Joi.object({
  refagency: dropdownString.allow('', null).optional(),
  casetype: dropdownString.allow('', null).optional(),
}).unknown(false);

// ── docketdetails sub-schema (used by addDocket / legacy docketdetails payload) ──
// .unknown(true) preserves any legacy fields not listed here.
// All dates are YYYY-MM-DD — that is what the add-docket flow sends.
// hearingdate additionally allows '0000-00-00' (legacy zero-date for Pending dockets).
const docketDetailsSchema = Joi.object({
  docketclerk:        Joi.string().max(100).allow('', null).optional(),
  daterequested:      pastOrTodayDateString,   // no future dates allowed
  datereceivedbyOSAH: pastOrTodayDateString,   // no future dates allowed
  refagency:          dropdownString.allow('', null).optional(),
  casetype:           dropdownString.allow('', null).optional(),
  county:             dropdownString.allow('', null).optional(),
  agencyrefnumber:    agencyReferenceNoSchema.allow('').optional(),
  status:             dropdownString.allow('', null).optional(),
  hearingmode:        dropdownString.allow('', null).optional(),
  hearingsite:        dropdownString.allow('', null).optional(),
  hearingdate:        dateStringDashboardSchema.allow('0000-00-00'),
  hearingtime:        dropdownString.allow('', null).optional(),
  hearingtime_id:     Joi.number().integer().allow(null).optional(),
  judge:              dropdownString.allow('', null).optional(),
  judgeassistant:     dropdownString.allow('', null).optional(),
  staffattorney:      dropdownString.allow('', null).optional(),
  casefiletype:       Joi.string().max(50).allow('', null).optional(),
  casename:           Joi.string().max(255).allow('', null).optional(),
  temp_permits:       Joi.string().max(50).allow('', null).optional(),
  telv_o_five:        Joi.string().valid('0', '1').allow('', null).optional(),
}).unknown(true); // allow extra legacy fields without stripping them

// ── addDocketDetailsSchema ───────────────────────────────────────────────────
// Forks the shared base schema to make the 8 mandatory docket fields required.
// Uses Joi .fork() so all other optional/unknown fields are still allowed.
const addDocketDetailsSchema = docketDetailsSchema
  .fork(['refagency', 'casetype', 'county', 'hearingmode', 'judge', 'judgeassistant'], (field) =>
    field.required().disallow('', null).messages({
      'any.required': '{{#label}} is required',
      'any.invalid':  '{{#label}} must not be empty',
    })
  )
  .fork(['daterequested', 'datereceivedbyOSAH'], (field) =>
    field.required().disallow('', null).messages({
      'any.required':       '{{#label}} is required',
      'any.invalid':        '{{#label}} must not be empty',
      'string.pattern.base': '{{#label}} must be in YYYY-MM-DD format',
    })
  );

// ── addDocket ────────────────────────────────────────────────────────────────
const addDocketSchema = Joi.object({
  docketdetails: addDocketDetailsSchema.required().messages({ 'any.required': 'docketdetails is required' }),
  contyId: Joi.object({
    conty_id: requiredPositiveInt.messages({
      'any.required': 'contyId.conty_id is required',
      'number.positive': 'contyId.conty_id must be a positive integer',
    }),
  }).optional(),
}).unknown(false);

const updateDocketInfoSchema = Joi.object({
  docketClerk: Joi.string().max(100).allow('', null).optional(),
  dateRequested: pastOrTodayDateString,
  dateReceivedByOSAH: dateStringDashboardSchema.allow('', null).optional(),
  refAgency: dropdownString.allow('', null).optional(),
  caseType: dropdownString.allow('', null).optional(),
  county: dropdownString.allow('', null).optional(),
  agencyRefNumber: agencyReferenceNoSchema.allow('', null).optional(),
  status: dropdownString.allow('', null).optional(),
  hearingMode: dropdownString.allow('', null).optional(),
  hearingSite: dropdownString.allow('', null).optional(),
  hearingDate: dateStringDashboardSchema.allow('0000-00-00'),
  hearingTime: dropdownString.allow('', null).optional(),
  hearingTimeId: Joi.string().max(20).allow('', null).optional(),
  judge: dropdownString.allow('', null).optional(),
  judgeAssistant: dropdownString.allow('', null).optional(),
  staffAttorney: dropdownString.allow('', null).optional(),
  caseFileType: Joi.string().max(50).allow('', null).optional(),
  caseName: Joi.string().max(255).allow('', null).optional(),
  tempPermits: Joi.string().max(50).allow('', null).optional(),
  telvOFive: Joi.string().valid('0', '1').allow('', null).optional(),
}).unknown(false);

const updateDocketSchema = Joi.object({
  docketId: requiredNumericString.messages({
    'any.required': 'docketId is required',
    'string.pattern.base': 'docketId must be a numeric string',
  }),
  docketInfo: updateDocketInfoSchema.optional(),
  countyId: Joi.object({
    countyId: requiredNumericString.messages({
      'any.required': 'countyId.countyId is required',
      'string.pattern.base': 'countyId.countyId must be a numeric string',
    }),
  }).unknown(false).optional(),
  reopenCaseFlag: Joi.string().max(20).allow('', null).optional(),
  reopenHearingInfo: Joi.string().allow('', null).optional(),
})
  .unknown(false);

// ── addHistory ───────────────────────────────────────────────────────────────
const addHistorySchema = Joi.object({
  caseId: requiredNumericString.messages({
    'any.required': 'caseId is required',
    'string.pattern.base': 'caseId must be a numeric string',
  }),
  message: Joi.string().min(1).required().messages({
    'any.required': 'message is required',
    'string.empty': 'message must not be empty',
  }),
}).unknown(false);

// ── hearingDateManual ─────────────────────────────────────────────────────────
const hearingDateManualConditionSchema = Joi.object({
  token: requiredNumericString.messages({
    'any.required': 'condition.token is required',
    'string.pattern.base': 'condition.token must be a numeric string',
  }),
  judge_id: optionalNumericString.messages({
    'string.pattern.base': 'condition.judge_id must be a numeric string',
  }),
  judge_assistant_id: optionalNumericString.messages({
    'string.pattern.base': 'condition.judge_assistant_id must be a numeric string',
  }),
  court_location_id: optionalNumericString.messages({
    'string.pattern.base': 'condition.court_location_id must be a numeric string',
  }),
  casetype_id: optionalNumericString.messages({
    'string.pattern.base': 'condition.casetype_id must be a numeric string',
  }),
  casetype: dropdownString.allow('').optional(),
  hearingTimeId: optionalNumericString.messages({
    'string.pattern.base': 'condition.hearingTimeId must be a numeric string',
  }),
  hearingTime: dropdownString.allow('').optional(),
  hearingDate: Joi.string()
    .allow('')
    .optional()
    .custom((value, helpers) => {
      if (!value) return value;
      // Accept YYYY-MM-DD format
      const yyyymmdd = /^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/;
      // Accept MM-DD-YYYY format
      const mmddyyyy = /^(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])-\d{4}$/;
      if (yyyymmdd.test(value) || mmddyyyy.test(value)) return value;
      return helpers.message('condition.hearingDate must be in YYYY-MM-DD or MM-DD-YYYY format');
    }),
  hearingDateValEnteredByUser: Joi.boolean().required().messages({ 'any.required': 'condition.hearingDateValEnteredByUser is required' }),
}).unknown(false);

const hearingDateManualSchema = Joi.object({
  condition: hearingDateManualConditionSchema.required().messages({ 'any.required': 'condition is required' }),
}).unknown(false);

// ── Validate functions ────────────────────────────────────────────────────────
const OPT = { abortEarly: false, stripUnknown: true };

export function validateGetHearingInfoForDocket(data) {
  const { error, value } = getHearingInfoForDocketSchema.validate(data, OPT);
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getHearingInfoForDocket');
  return value;
}

export function validateCheckSkipHearing(data) {
  const { error, value } = checkSkipHearingSchema.validate(data, OPT);
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'checkSkipHearing');
  return value;
}

export function validateGetConfidentialCaseType(data) {
  const { error, value } = getConfidentialCaseTypeSchema.validate(data, OPT);
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getConfidentialCaseType');
  return value;
}

export function validateAddDocket(data) {
  // Use stripUnknown only at the top level; docketdetails.unknown(true) keeps legacy fields.
  const { error, value } = addDocketSchema.validate(data, { abortEarly: false, stripUnknown: { arrays: false, objects: false } });
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'addDocket');
  return value;
}

export function validateUpdateDocket(data) {
  const { error, value } = updateDocketSchema.validate(data, { abortEarly: false, stripUnknown: { arrays: false, objects: false } });
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'updateDocket');
  return value;
}

export function validateAddHistory(data) {
  const { error, value } = addHistorySchema.validate(data, OPT);
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'addHistory');
  return value;
}

export function validateHearingDateManual(data) {
  const { error, value } = hearingDateManualSchema.validate(data, OPT);
  if (error) throw new ValidationError(error.details.map((e) => e.message).join(', '), 'hearingDateManual');
  return value;
}

