/*
  Created by  : Snehal Narkar
  Date        : 2026-08-10
  Description : Joi validation schemas for the Admin Billable Agencies endpoints
                (Time & Expense). Mirrors the required-field checks from legacy
                billing-agency-controller.js's addUpdateUser(), replacing the
                free-form if/else chain with declarative conditional (.when) rules.
*/
import Joi from 'joi';
import {
  nameSchema,
  zipCodeSchema,
  emailSchema,
  requiredPositiveInt,
  requiredText,
  optionalText,
} from '../../validators.js';

// id is omitted entirely on Add (see useBillableAgencyForm.js) and a positive int on Edit;
// .allow(null) is kept as a defensive fallback in case it's ever sent explicitly as null.
const optionalPositiveInt = Joi.number().integer().positive().allow(null);
const optionalName = nameSchema.allow('').optional();

// ── List Schema ────────────────────────────────────────────────────────────────
// No search filter — matches legacy Angular's client-side filter:search_users; the frontend
// fetches the full list once and filters it locally instead of sending a search term.
export const billableAgencyListSchema = Joi.object({}).unknown(false);

// ── Details Schema ─────────────────────────────────────────────────────────────
export const billableAgencyDetailsSchema = Joi.object({
  id: requiredPositiveInt.messages({
    'any.required': 'id is required',
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
  }),
}).unknown(false);

// ── Status Schema ──────────────────────────────────────────────────────────────
export const billableAgencyStatusSchema = Joi.object({
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

// ── Save (Add/Edit) Schema ────────────────────────────────────────────────────
// Agency Description must not contain commas — mirrors legacy's explicit check.
const agencyDescription = requiredText('Agency Description').custom((value, helpers) => {
  if (value.includes(',')) return helpers.message('Agency Description should not contain commas');
  return value;
});

export const billableAgencySaveSchema = Joi.object({
  id: optionalPositiveInt,

  agencyDescription,
  agencyCode: requiredText('Agency Code'),
  parentAgency: optionalText,
  firstName: nameSchema,
  lastName: nameSchema,
  middleName: optionalName,
  email: emailSchema,
  addressLineOne: requiredText('Address Line One'),
  addressLineTwo: optionalText,
  city: requiredText('City'),
  state: requiredText('State'),
  zipcode: zipCodeSchema,

  billingContactOneEnabled: Joi.boolean().default(false),
  firstNameTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: nameSchema,
    otherwise: optionalName,
  }),
  lastNameTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: nameSchema,
    otherwise: optionalName,
  }),
  middleNameTwo: optionalName,
  emailTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: emailSchema,
    otherwise: emailSchema.allow('').optional(),
  }),
  addressLineBillingOne: optionalText,
  addressLineBillingTwo: optionalText,
  cityTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: requiredText('billing contact City'),
    otherwise: optionalText,
  }),
  stateTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: requiredText('billing contact State'),
    otherwise: optionalText,
  }),
  zipcodeTwo: Joi.when('billingContactOneEnabled', {
    is: true,
    then: zipCodeSchema,
    otherwise: zipCodeSchema.allow('').optional(),
  }),

  billingContactTwoEnabled: Joi.boolean().default(false),
  firstNameThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: nameSchema,
    otherwise: optionalName,
  }),
  lastNameThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: nameSchema,
    otherwise: optionalName,
  }),
  emailThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: emailSchema,
    otherwise: emailSchema.allow('').optional(),
  }),
  addressLineBillingThree: optionalText,
  addressLineBillingFour: optionalText,
  cityThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: requiredText('billing contact City'),
    otherwise: optionalText,
  }),
  stateThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: requiredText('billing contact State'),
    otherwise: optionalText,
  }),
  zipcodeThree: Joi.when('billingContactTwoEnabled', {
    is: true,
    then: zipCodeSchema,
    otherwise: zipCodeSchema.allow('').optional(),
  }),
}).unknown(false);
