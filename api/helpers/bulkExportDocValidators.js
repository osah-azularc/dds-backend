import Joi from 'joi';
import { ValidationError } from './validators.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-31
  Description : Joi validation schema for POST /bulk-export-doc/generate-documents
                (see bulkExportDocController.js / bulkExportDocHelper.js).
                Follows the same pattern as reportValidators.js / osahForm1Validators.js.
*/

// refAgencyId arrives as either a number or a numeric string (Angular sends the
// select option's raw value) — Joi.number() converts either into a number.
const requiredAgencyId = Joi.number().integer().positive().required().messages({
  'any.required': 'refAgencyId is required',
  'number.base': 'refAgencyId must be a number',
});

// dateReceived is always sent as 'YYYY-MM-DD' (dayjs/moment .format('YYYY-MM-DD')).
// Date.parse/`new Date(...)` silently roll over invalid calendar dates (e.g. '2026-02-31'
// becomes March 3) instead of rejecting them, so validity is confirmed by round-tripping
// through Date.UTC and checking the parsed year/month/day still match the input exactly.
const dateReceivedSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required()
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const isRealDate = parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
    if (!isRealDate) return helpers.message('{{#label}} is not a valid date');
    return value;
  })
  .messages({
    'any.required': 'dateReceived is required',
    'string.pattern.base': 'dateReceived must be in YYYY-MM-DD format',
  });

// 'yes'/'no' are what the frontend sends; plain booleans are accepted too since
// bulkExportDocHelper.js treats `ninetyOneDay === true` the same as 'yes'.
const ninetyOneDaySchema = Joi.alternatives(Joi.boolean(), Joi.string().valid('yes', 'no')).optional().messages({
  'alternatives.types': 'ninetyOneDay must be true/false or "yes"/"no"',
});

// Party-type labels (e.g. 'Petitioner', 'Petitioner Attorney') come from the
// peopledetails/agencycaseworker/attorneybycase typeOfContact column, not a fixed
// enum — validated as non-blank strings rather than a hardcoded whitelist.
const partyTypeArraySchema = Joi.array().items(Joi.string().trim().min(1).max(100));

const requiredMailerContacts = partyTypeArraySchema.min(1).required().messages({
  'array.min': 'mailerContacts must be a non-empty array',
  'any.required': 'mailerContacts is required',
});

const caseIdsSchema = Joi.array().items(
  Joi.alternatives(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/)),
);

const generateBulkExportDocSchema = Joi.object({
  refAgencyId: requiredAgencyId,
  // caseType/documentId/mailerCount are accepted for parity with legacy's docketinfo shape
  // but aren't authoritative — see bulkExportDocController.js doc comment.
  caseType: Joi.string().max(50).allow('', null).optional(),
  documentId: Joi.alternatives(Joi.string().max(20), Joi.number()).optional(),
  documentVariant: Joi.string().max(50).optional(),
  dateReceived: dateReceivedSchema,
  ninetyOneDay: ninetyOneDaySchema,
  mailerContacts: requiredMailerContacts,
  mailerCount: Joi.number().integer().min(0).optional(),
  partyContacts: partyTypeArraySchema.optional().default([]),
  caseIds: caseIdsSchema.optional().default([]),
}).unknown(false);

export function validateGenerateBulkExportDoc(data) {
  const { error, value } = generateBulkExportDocSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'generateBulkExportDoc');
  }
  return value;
}
