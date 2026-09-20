import Joi from 'joi';
import {
  starredAction,
  viewedAction,
  flag,
  ValidationError,
  docketNumberSchema,
} from './validators.js';


export const notificationType= Joi.string()
  .valid('unread', 'viewed', 'starred', 'all', 'te')
  .optional()
  .default('unread')
  .messages({
    'any.only': 'Notification type must be one of: unread, viewed, starred, all, te',
  });

export const notificationLimit= Joi.alternatives()
  .try(
    Joi.number().integer().min(1).max(500),
    Joi.string().pattern(/^\d+$/).custom((value, helpers) => {
      const num = Number.parseInt(value, 10);
      if (num < 1 || num > 500) {
        return helpers.error('any.invalid');
      }
      return value;
    })
  )
  .optional()
  .messages({
    'number.min': 'Notification limit must be at least 1',
    'number.max': 'Notification limit must not exceed 500',
    'string.pattern.base': 'Notification limit must be a valid number',
    'any.invalid': 'Notification limit must be between 1 and 500',
  });

export const notificationId = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.base': 'Notification ID must be a number',
    'number.integer': 'Notification ID must be an integer',
    'number.positive': 'Notification ID must be a positive number',
    'any.required': 'Notification ID is required',
  });
/**
 * Validation schema for getUnreadNotiData API
 * Validates notification limit and notification type
 */
const getUnreadNotiDataSchema = Joi.object({
  notificationLimit: notificationLimit,
  notificationType: notificationType,
}).unknown(false);

/**
 * Validation schema for actionDocketNoti API
 * Validates notification action parameters
 */
const actionDocketNotiSchema = Joi.object({
  notificationId: notificationId,
  starredAction: starredAction,
  viewedAction: viewedAction,
  flag: flag,
}).unknown(false);

/**
 * Validation schema for updateTE API
 * Validates TE notification action parameters
 */
const updateTESchema = Joi.object({
  notificationId: notificationId,
  starredAction: starredAction,
  viewedAction: viewedAction,
}).unknown(false);

/**
 * Validate getUnreadNotiData request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateGetUnreadNotiData(data) {
  const { error, value } = getUnreadNotiDataSchema.validate(data, { 
    abortEarly: false, 
    stripUnknown: true 
  });
  
  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '), 
      'getUnreadNotiData'
    );
  }
  
  return value;
}

/**
 * Validate actionDocketNoti request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateActionDocketNoti(data) {
  const { error, value } = actionDocketNotiSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'actionDocketNoti'
    );
  }

  return value;
}

/**
 * Validate updateTE request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateUpdateTE(data) {
  const { error, value } = updateTESchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'updateTE'
    );
  }

  return value;
}

// ─── Follow Docket field schemas ─────────────────────────────────────────────

// docket: required numeric string (1–10 digits), reuses shared docketNumberSchema
const docket = docketNumberSchema.required().messages({
  'any.required': 'Docket number is required',
  'string.empty': 'Docket number is required',
});

// follow_action: '0' (unfollow) or '1' (follow) — accepts string or number
const followAction = Joi.alternatives()
  .try(
    Joi.string().valid('0', '1'),
    Joi.number().valid(0, 1)
  )
  .required()
  .messages({
    'any.required': 'Follow action is required',
    'any.only': 'Follow action must be "0" (unfollow) or "1" (follow)',
  });

/**
 * Validation schema for followDocketNoti API
 * Validates docket number and follow action
 */
const followDocketNotiSchema = Joi.object({
  docket,
  follow_action: followAction,
}).unknown(false);

const assignedJudgeSaName = Joi.string()
  .trim()
  .allow('', null)
  .optional();

/**
 * Validation schema for unfollowDocketPreviousJudgeSa API
 * Matches legacy PHP payload used after docket general info updates.
 */
const unfollowDocketPreviousJudgeSaSchema = Joi.object({
  docket,
  previousJudge: assignedJudgeSaName,
  previousStaffattorney: assignedJudgeSaName,
  newJudge: assignedJudgeSaName,
  newStaffattorney: assignedJudgeSaName,
}).unknown(false);

/**
 * Validate followDocketNoti request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */

/**
 * Validation schema for followDocketStatusNoti API
 * Validates docket number only (userId comes from middleware)
 */
const followDocketStatusNotiSchema = Joi.object({
  docket,
}).unknown(false);

/**
 * Validate followDocketNoti request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateFollowDocketNoti(data) {
  const { error, value } = followDocketNotiSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'followDocketNoti'
    );
  }

  return value;
}

/**
 * Validate followDocketStatusNoti request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateFollowDocketStatusNoti(data) {
  const { error, value } = followDocketStatusNotiSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'followDocketStatusNoti'
    );
  }

  return value;
}

/**
 * Validate unfollowDocketPreviousJudgeSa request payload
 * @param {Object} data - Request payload
 * @returns {Object} Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateUnfollowDocketPreviousJudgeSa(data) {
  const { error, value } = unfollowDocketPreviousJudgeSaSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ValidationError(
      error.details.map((err) => err.message).join(', '),
      'unfollowDocketPreviousJudgeSa'
    );
  }

  return value;
}

/**
 * Export schemas for direct use if needed
 */
export {
  getUnreadNotiDataSchema,
  actionDocketNotiSchema,
  updateTESchema,
  followDocketNotiSchema,
  followDocketStatusNotiSchema,
};

