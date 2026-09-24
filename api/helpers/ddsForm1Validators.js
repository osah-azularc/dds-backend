import Joi from 'joi';
import { ValidationError, agencyReferenceNoSchema } from './validators.js';

/*
  Validates the "Enter New Form 1" submission (DDS's own agency-facing
  creation form). Ports the field set from DdsController's legacy
  form1-new.phtml + form1-new-controller.js + DdsForm1Controller::adddocketAction(),
  NOT osahForm1Validators.js's addDocket (that one is OSAH-staff's internal
  "New Docket" tool, which requires judge/CMA/hearing mode up front — DDS's
  submission intentionally does not collect those; OSAH assigns them later).
*/

const dropdownString = Joi.string().max(500);

const dateStringPattern = /^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/;

// Plain YYYY-MM-DD date string, no past/future restriction. Used for the
// permit fields the legacy jQuery datepickers don't cap with `endDate: '+0d'`
// (form1-new-controller.js: #new_docket-effectivedate and
// #newdocket_incident_date have no endDate option) plus the auto-computed,
// non-user-editable expiry date (which is always in the future by design).
const dateString = Joi.string()
  .pattern(dateStringPattern)
  .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' });

// Date string that rejects future dates. Only the fields the legacy
// datepickers actually cap with `endDate: '+0d'` use this: Date Requested
// (#new_docket-reqdate) and Date of Birth (#newdocket_dob).
const pastOrTodayDateString = dateString.custom((value, helpers) => {
  const today = new Date().toISOString().slice(0, 10);
  if (value > today) return helpers.message('{{#label}} cannot be a future date');
  return value;
});

const optionalDateString = dateString.allow('', null).optional();
const optionalPastOrTodayDateString = pastOrTodayDateString.allow('', null).optional();

const docketDetailsSchema = Joi.object({
  refagency: dropdownString.required().messages({ 'any.required': 'Agency Code is required' }),
  casetype: dropdownString.required().messages({ 'any.required': 'Case Type is required' }),
  county: dropdownString.allow('', null).optional(),
  daterequested: pastOrTodayDateString.required().messages({
    'any.required': 'Date Requested is required',
  }),
  agencyrefnumber: agencyReferenceNoSchema.required().messages({
    'any.required': 'Agency Reference Number is required',
  }),
  hearingmode: dropdownString.allow('', null).optional(),
  docketclerk: Joi.string().max(100).allow('', null).optional(),
  eligiblepermit: Joi.string().valid('0', '1').required(),
  permiteffectivedate: optionalDateString,
  expiryDate: optionalDateString,
  DOB: optionalPastOrTodayDateString,
  incident_date: optionalDateString,
  contyId: Joi.string().allow('', null).optional(),
}).unknown(false);

const addDocketSchema = Joi.object({
  docketdetails: docketDetailsSchema.required().messages({
    'any.required': 'docketdetails is required',
  }),
}).unknown(false);

export function validateAddDdsDocket(data) {
  const { error, value } = addDocketSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'addDdsDocket');
  }

  // Temporary permit fields are only required once the agency marks the
  // case permit-eligible (matches form1-new-controller.js's addDocket()).
  const { docketdetails } = value;
  if (docketdetails.eligiblepermit === '1') {
    const missing = ['permiteffectivedate', 'DOB', 'incident_date'].filter(
      (field) => !docketdetails[field],
    );
    if (missing.length > 0) {
      throw new ValidationError(
        'Permit Effective Date, Date of Birth, and Incident Date are required when eligible for a permit',
        'addDdsDocket',
      );
    }
  }

  return value;
}
