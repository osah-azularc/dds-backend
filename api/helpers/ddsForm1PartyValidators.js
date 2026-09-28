import Joi from 'joi';
import {
  ValidationError,
  nameSchema,
  agencyReferenceNoSchema,
  ZIP_CODE_REGEX,
  EMAIL_REGEX,
  NAME_REGEX,
} from './validators.js';

/*
  Validates the "Add Party" / "Edit Party" modal on the existing-docket
  review screen (/form1/reqdt/:form1Id). Ports the Petitioner/Petitioner
  Attorney branches of DdsForm1Controller::addPartyDDSDetailsAction() /
  editpartydetailsAction() -- the only two contact types DDS's own
  form1.phtml Add Party modal offers (Officer belongs to the separate
  1205-offence sub-form, out of scope here).
*/

const CONTACT_TYPES = ['Petitioner', 'Petitioner Attorney'];

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

// Shared by Add and Edit -- legacy's addPartyDDSDetailsAction/editpartydetailsAction accept the
// same field set for both. `licenseNumber` (Petitioner only) is not a Form1Parties column; it's
// the docket's own Agency Reference Number, surfaced in this modal (see legacy's
// updatelicensenumberAction()) -- the service writes it to Form1Docket, not Form1Parties.
const partyDetailsSchema = Joi.object({
  contactType: Joi.string().valid(...CONTACT_TYPES).required().messages({
    'any.only': 'Contact Type must be Petitioner or Petitioner Attorney',
    'any.required': 'Contact Type is required',
  }),
  lastName: nameSchema.messages({ 'any.required': 'Last Name is required' }),
  firstName: nameSchema.messages({ 'any.required': 'First Name is required' }),
  middleName: optionalName,
  licenseNumber: agencyReferenceNoSchema.allow('', null).optional(),
  attorneyBar: optionalText(100),
  company: optionalText(200),
  isNewContact: Joi.string().valid('0', '1').allow('', null).optional(),
  isInternationalAddr: Joi.string().valid('0', '1').required().messages({
    'any.required': '"Is this an international address?" is required',
  }),
  internationalAddress: optionalText(500),
  address1: optionalText(100),
  address2: optionalText(100),
  city: optionalText(45),
  state: optionalText(45),
  zip: optionalZip,
  phone: optionalText(20),
  email: optionalEmail,
  fax: optionalText(20),
  altAddress1: optionalText(100),
  altAddress2: optionalText(100),
  altCity: optionalText(45),
  altState: optionalText(45),
  altZipCode: optionalZip,
}).unknown(false);

// Fields required beyond what Joi's static schema can express, mirroring the
// eligiblepermit-driven conditional requireds in ddsForm1Validators.js.
function assertConditionalRequireds(partydetails) {
  const missing = [];

  if (partydetails.contactType === 'Petitioner' && !partydetails.licenseNumber) {
    missing.push('License Number');
  }
  if (partydetails.contactType === 'Petitioner Attorney' && !partydetails.isNewContact) {
    missing.push('"Is this a new party or new address?"');
  }

  if (partydetails.isInternationalAddr === '1') {
    if (!partydetails.internationalAddress) missing.push('International Address');
  } else {
    ['address1', 'city', 'state', 'zip'].forEach((field) => {
      if (!partydetails[field]) missing.push(field);
    });
  }

  if (missing.length > 0) {
    throw new ValidationError(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`, 'addDdsParty');
  }
}

const addPartySchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  partydetails: partyDetailsSchema.required().messages({ 'any.required': 'partydetails is required' }),
}).unknown(false);

export function validateAddDdsParty(data) {
  const { error, value } = addPartySchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'addDdsParty');
  }
  assertConditionalRequireds(value.partydetails);
  return { form1Id: Number.parseInt(value.form1Id, 10), partydetails: value.partydetails };
}

const editPartySchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  partyId: idParam.messages({ 'any.required': 'partyId is required' }),
  partydetails: partyDetailsSchema.required().messages({ 'any.required': 'partydetails is required' }),
}).unknown(false);

export function validateEditDdsParty(data) {
  const { error, value } = editPartySchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'editDdsParty');
  }
  assertConditionalRequireds(value.partydetails);
  return {
    form1Id: Number.parseInt(value.form1Id, 10),
    partyId: Number.parseInt(value.partyId, 10),
    partydetails: value.partydetails,
  };
}

// Ports DdsForm1Controller::autopopulateddsAction() -- only 'Petitioner Attorney' returns
// suggestions in legacy (Petitioner has no autocomplete), but the endpoint itself doesn't
// reject other contact types, so this only validates shape, not the value.
const autopopulateSchema = Joi.object({
  contactType: Joi.string().valid(...CONTACT_TYPES).required().messages({
    'any.required': 'contactType is required',
  }),
}).unknown(false);

export function validateAutopopulateDdsParty(data) {
  const { error, value } = autopopulateSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'autopopulateDdsParty');
  }
  return value;
}

// Ports DdsForm1Controller::getddsinformationAction() -- `partyId` here is the composite
// "<sno>-B" id the autopopulate suggestion list returns, not a Form1Parties.partyId.
const getPartyAutofillSchema = Joi.object({
  partyId: Joi.string().pattern(/^\d+-B$/).required().messages({
    'string.pattern.base': 'partyId must be a suggestion id (e.g. "123-B")',
    'any.required': 'partyId is required',
  }),
}).unknown(false);

export function validateGetPartyAutofillDetails(data) {
  const { error, value } = getPartyAutofillSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getPartyAutofillDetails');
  }
  return value;
}

// Ports DdsForm1Controller::getPartyDetailsAction() (dds-form1/get-party-details) -- lists
// every party on a docket, kept as its own endpoint rather than bundled into
// searchdocketinfo's response, matching legacy's own separate action.
const getPartyListSchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
}).unknown(false);

export function validateGetPartyList(data) {
  const { error, value } = getPartyListSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getPartyList');
  }
  return { form1Id: Number.parseInt(value.form1Id, 10) };
}

// Ports DdsForm1Controller::deletepartyAction() -- contactType decides which docket
// display field (casename/attorneyforpetitioner) gets updated after the delete.
const deletePartySchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  partyId: idParam.messages({ 'any.required': 'partyId is required' }),
  contactType: Joi.string().valid(...CONTACT_TYPES).required().messages({
    'any.only': 'Contact Type must be Petitioner or Petitioner Attorney',
    'any.required': 'Contact Type is required',
  }),
}).unknown(false);

export function validateDeleteDdsParty(data) {
  const { error, value } = deletePartySchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'deleteDdsParty');
  }
  return {
    form1Id: Number.parseInt(value.form1Id, 10),
    partyId: Number.parseInt(value.partyId, 10),
    contactType: value.contactType,
  };
}
