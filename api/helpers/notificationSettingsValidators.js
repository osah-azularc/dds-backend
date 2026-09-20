import Joi from 'joi';
import { ValidationError, docketNumberSchema } from './validators.js';
// ─── Notification Setting field schemas ──────────────────────────────────────

// caseIdArray: array of docket-number case IDs (allowed empty). Reuses the
// shared docketNumberSchema (numeric string, 1-10 digits).
const caseIdArray = Joi.array()
  .items(docketNumberSchema)
  .default([])
  .messages({
    'array.base': 'caseIdArray must be an array of case IDs',
  });

// notiStatus: boolean / 0 / 1 / '0' / '1'
const notiStatus = Joi.alternatives()
  .try(
    Joi.boolean(),
    Joi.string().valid('0', '1', 'true', 'false'),
    Joi.number().valid(0, 1)
  )
  .required()
  .messages({
    'any.required': 'notiStatus is required',
  });

// notiOnOffFlagField: any value (PHP uses !empty()). Empty string switches to docket-unfollow branch.
const notiOnOffFlagField = Joi.any().allow('', null).optional();

// searchCondition: string (can be empty)
const searchCondition = Joi.string().allow('', null).max(255).default('').messages({
  'string.max': 'searchCondition must not exceed 255 characters',
});

const docketUnfollowSchema = Joi.object({
  caseIdArray,
  notiStatus,
  notiOnOffFlag: notiOnOffFlagField,
}).unknown(false);

const searchFollowedDocketSchema = Joi.object({
  searchCondition,
}).unknown(false);

/**
 * Validate docketUnfollow request payload
 */
export function validateDocketUnfollow(data) {
  const { error, value } = docketUnfollowSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'docketUnfollow'
    );
  }

  return value;
}

/**
 * Validate searchFollowedDocket request payload
 */
export function validateSearchFollowedDocket(data) {
  const { error, value } = searchFollowedDocketSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'searchFollowedDocket'
    );
  }

  return value;
}

export {
  docketUnfollowSchema,
  searchFollowedDocketSchema,
};
