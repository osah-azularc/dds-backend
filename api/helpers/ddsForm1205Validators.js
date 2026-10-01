import Joi from 'joi';
import {
  ValidationError,
  nameSchema,
  ZIP_CODE_REGEX,
  EMAIL_REGEX,
  NAME_REGEX,
  dateStringDashboardSchema,
} from './validators.js';

/*
  Validates the Form 1205 screen's submit endpoints (Officer Information,
  Incident Information, and the docket's DPS/Respondent Attorney
  finalization). Ports DdsForm1Controller::addPartyDetailsAction()'s
  'Officer' and 'Form1205' branches plus updateddstodpsAction()/
  addattorneyrespondentAction()/search1205infoAction() -- field names here
  match form1205Constants.js's fields 1:1 (precinct/address map onto
  form1_parties.address1/address2, matching legacy's own
  ng-model="address1"/"address2" -- see form1-1205form.phtml lines
  314/341). Title/Company have no field in DDS's 1205 screen (legacy's own
  form has none either), so they're not part of this contract.

  Officer Information and Incident Information both post to
  /dds-form1/addPartyDetails, exactly like legacy's own frontend does (two
  calls to the same URL, one per contactType) -- see
  ddsForm1205Controller.js's addPartyDetailsHandler for the dispatch.
*/

const idParam = Joi.alternatives()
  .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
  .required();

const optionalName = Joi.string()
  .max(50)
  .pattern(NAME_REGEX)
  .allow('', null)
  .optional()
  .messages({ 'string.pattern.base': 'Use letters only. Hyphens and apostrophes are allowed.' });

const optionalZip = Joi.string()
  .trim()
  .pattern(ZIP_CODE_REGEX)
  .allow('', null)
  .optional()
  .messages({ 'string.pattern.base': 'Zip code must be in 30309 or 30309-1234 format.' });

const optionalEmail = Joi.string()
  .max(254)
  .pattern(EMAIL_REGEX)
  .allow('', null)
  .optional()
  .messages({ 'string.pattern.base': 'Must be a valid email address.' });

const optionalText = (max) => Joi.string().max(max).allow('', null).optional();

// Required-field set matches form1205ValidationRules.js's own GEORGIA_FLAG/PRECINCT/CITY/
// STATE/ZIP_CODE_VALIDATION_REQUIRED constants (legacy's add_1205 class set) -- but, like that
// frontend rule set (see useForm1205Form.js/form1205SubmitValidation.js), only actually
// enforced when `buttonStatus` is 'submit'. Save For Later deliberately allows an
// incomplete-but-not-malformed Officer Information draft, so these same fields stay merely
// optional (still format/length-checked) while saving.
const requiredWhenSubmitting = (schema, submitSchema, message) =>
  Joi.when('buttonStatus', {
    is: 'submit',
    then: submitSchema.messages({ 'any.required': message }),
    otherwise: schema,
  });

const officerDetailsSchema = Joi.object({
  lastName: requiredWhenSubmitting(optionalName, nameSchema, 'Last Name is required'),
  firstName: requiredWhenSubmitting(optionalName, nameSchema, 'First Name is required'),
  middleName: optionalName,
  precinct: optionalText(100),
  isGeorgiaState: requiredWhenSubmitting(
    Joi.string().valid('0', '1').allow('', null).optional(),
    Joi.string().valid('0', '1').required(),
    'Does the Officer belong to Georgia State Patrol or Georgia Department of Public Safety? is required',
  ),
  address: optionalText(100),
  city: optionalText(45),
  state: optionalText(45),
  zip: optionalZip,
  phone: optionalText(20),
  email: optionalEmail,
  fax: optionalText(20),
  badgeNo: optionalText(100),
  // The existing Officer party's own party_id (form1_parties' real primary key), once one
  // exists (from a prior save or from search1205info) -- tells addOfficerPartyDetails() to
  // update that row instead of inserting a new one. Not sent for a docket's first-ever save.
  partyId: Joi.number().integer().positive().optional(),
  // Mirrors incidentDetailsSchema's own `buttonStatus` -- Officer Information and Incident
  // Information save as two separate requests (see ddsForm1205Controller.js), so this one
  // needs its own copy to know whether Precinct/City/State/Zip (assertOfficerRequireds below)
  // and Last/First Name/Georgia State Patrol are actually required for this request.
  buttonStatus: Joi.string().valid('save', 'submit').required().messages({
    'any.required': 'buttonStatus is required',
  }),
}).unknown(false);

function assertOfficerRequireds(officerDetails) {
  if (officerDetails.buttonStatus !== 'submit') return;

  const missing = [];
  if (!officerDetails.precinct) missing.push('Precinct');
  if (!officerDetails.city) missing.push('City');
  if (!officerDetails.state) missing.push('State');
  if (!officerDetails.zip) missing.push('Zip Code');

  if (missing.length > 0) {
    throw new ValidationError(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`, 'addOfficerParty');
  }
}

// Incident Information -> form1_dds_1205_offence. Nothing here is required server-side --
// form1205ValidationRules.js's own required set (Citation/County/Incident Date/DOB/Driver
// Request) is enforced client-side only, matching legacy (these fields carry `add_1205` but,
// unlike Officer Information, are never `ng-disabled`, so they're always-required there too;
// re-asserting that here would just duplicate the frontend rule for a screen with no other
// caller).
const incidentDetailsSchema = Joi.object({
  citation: optionalText(50),
  countyOccur: optionalText(100),
  incidentDate: dateStringDashboardSchema,
  incidentTime: optionalText(20),
  officerBadgeNumber: optionalText(100),
  commercialVehicle: Joi.string().valid('0', '1').allow('', null).optional(),
  hazardousVehicle: Joi.string().valid('0', '1').allow('', null).optional(),
  stateOfIssue: optionalText(45),
  // form1_dds_1205_offence.license_class_id is only VARCHAR(11) -- capped here to match, so an
  // over-length value fails validation with a clear message instead of erroring at the DB.
  licenseClass: optionalText(11),
  dob: dateStringDashboardSchema,
  restrictions: optionalText(200),
  gender: Joi.string().valid('0', '1').allow('', null).optional(),
  feet: optionalText(2),
  inches: optionalText(2),
  weight: optionalText(5),
  driverRequest: Joi.string().valid('1', '2', '3', '4').allow('', null).optional(),
  // The Officer party's own party_id (see officerDetailsSchema's `partyId`) -- links the
  // offence row back to the officer it's about, replacing legacy's own broken sno/officerrid.
  officerId: Joi.number().integer().positive().optional(),
  // "Is this a new party or new address?" (Officer Information) -- legacy persists this on
  // form1_dds_1205_offence.is_new_officer (DdsForm1Controller.php's own search1205form query
  // selects `fdo.is_new_officer`), not form1_parties, since it's a one-off UI toggle rather
  // than data about the officer themselves. Read back on load so it doesn't reset to "No" (and
  // re-disable the whole Officer Information section) every time the screen reopens.
  isNewOfficer: Joi.string().valid('0', '1').allow('', null).optional(),
  buttonStatus: Joi.string().valid('save', 'submit').required().messages({
    'any.required': 'buttonStatus is required',
  }),
}).unknown(false);

const addPartyDetailsSchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  contactType: Joi.string().valid('Officer', 'form1205').required().messages({
    'any.required': 'contactType is required',
    'any.only': 'contactType must be "Officer" or "form1205"',
  }),
  officerDetails: Joi.when('contactType', {
    is: 'Officer',
    then: officerDetailsSchema.required().messages({ 'any.required': 'officerDetails is required' }),
    otherwise: Joi.forbidden(),
  }),
  incidentDetails: Joi.when('contactType', {
    is: 'form1205',
    then: incidentDetailsSchema.required().messages({ 'any.required': 'incidentDetails is required' }),
    otherwise: Joi.forbidden(),
  }),
}).unknown(false);

export function validateAddPartyDetails(data) {
  const { error, value } = addPartyDetailsSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'addPartyDetails');
  }

  const form1Id = Number.parseInt(value.form1Id, 10);
  if (value.contactType === 'Officer') {
    assertOfficerRequireds(value.officerDetails);
    return { form1Id, contactType: value.contactType, officerDetails: value.officerDetails };
  }
  return { form1Id, contactType: value.contactType, incidentDetails: value.incidentDetails };
}

// Shared by updateddstodps/addattorneyrespondent/search1205info -- all three only ever act on
// form1Id (legacy's updateddstodps ignores the rest of its payload -- see ddsForm1205Service.js).
const form1IdOnlySchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
}).unknown(false);

function validateForm1IdOnly(data, actionName) {
  const { error, value } = form1IdOnlySchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), actionName);
  }
  return { form1Id: Number.parseInt(value.form1Id, 10) };
}

export const validateUpdateDdsToDps = (data) => validateForm1IdOnly(data, 'updateDdsToDps');
export const validateAddAttorneyRespondent = (data) => validateForm1IdOnly(data, 'addAttorneyRespondent');
export const validateSearch1205Info = (data) => validateForm1IdOnly(data, 'search1205Info');
