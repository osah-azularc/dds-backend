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

/*
  Validates the "Form 1" review screen's initial load call — the request
  that resolves the form1_id from the URL's base64 `reqdt` param into the
  docket + party data. Ports DdsForm1Controller::searchdocketinfoAction()'s
  request shape: `{ tableName: "docketsearch", condition: <form1_id> }`.
  `tableName` is accepted (matching the legacy request body) but unused,
  same as the legacy action itself.
*/
const searchDocketInfoSchema = Joi.object({
  tableName: Joi.string().optional(),
  condition: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
    .required()
    .messages({
      'any.required': 'condition (form1_id) is required',
      'alternatives.match': 'condition must be a positive integer form1_id',
    }),
}).unknown(false);

export function validateSearchDocketInfo(data) {
  const { error, value } = searchDocketInfoSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'searchDocketInfo');
  }

  return { form1Id: Number.parseInt(value.condition, 10) };
}

/*
  Validates the Temporary Permit save on the existing-docket review screen
  (/form1/reqdt/:form1Id). Ports DdsForm1Controller::updatedocketAction()'s
  request shape — note `incidentDate` here (not `incident_date`, as
  addDocket uses); that mismatch exists in the legacy API itself. Only
  covers the Temporary Permit fields the UI actually lets an agency edit on
  an existing docket (see TemporaryPermitSection.jsx) — legacy's action also
  handles a "cloned"/resubmitted-docket workflow and a pre-printed-permit
  invalidation flag on form1_docket.temp_permits, neither of which is
  wired up here.
*/
const updateDocketDetailsSchema = Joi.object({
  agencyrefnumber: agencyReferenceNoSchema.required().messages({
    'any.required': 'Agency Reference Number is required',
  }),
  eligiblepermit: Joi.string().valid('0', '1').required(),
  permiteffectivedate: optionalDateString,
  expiryDate: optionalDateString,
  DOB: optionalPastOrTodayDateString,
  incidentDate: optionalDateString,
}).unknown(false);

const updateDocketSchema = Joi.object({
  form1Id: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
    .required()
    .messages({ 'any.required': 'form1Id is required' }),
  docketdetails: updateDocketDetailsSchema.required().messages({
    'any.required': 'docketdetails is required',
  }),
}).unknown(false);

export function validateUpdateDdsDocket(data) {
  const { error, value } = updateDocketSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'updateDdsDocket');
  }

  const { docketdetails } = value;
  if (docketdetails.eligiblepermit === '1') {
    const missing = ['permiteffectivedate', 'DOB', 'incidentDate'].filter(
      (field) => !docketdetails[field],
    );
    if (missing.length > 0) {
      throw new ValidationError(
        'Permit Effective Date, Date of Birth, and Incident Date are required when eligible for a permit',
        'updateDdsDocket',
      );
    }
  }

  return { form1Id: Number.parseInt(value.form1Id, 10), docketdetails };
}

/*
  Validates the "Delete Form1" button on the existing-docket review screen (only
  shown/enabled for a still-Draft docket, actualStatus === 'pending' -- see
  DocketTabBar.jsx). Ports DdsForm1Controller::deletedocketAction()'s request shape
  (legacy's own key is `docket_number`; this uses `form1Id` for consistency with this
  screen's other newer endpoints).
*/
const deleteDocketSchema = Joi.object({
  form1Id: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
    .required()
    .messages({ 'any.required': 'form1Id is required' }),
}).unknown(false);

export function validateDeleteDocket(data) {
  const { error, value } = deleteDocketSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'deleteDocket');
  }

  return { form1Id: Number.parseInt(value.form1Id, 10) };
}
