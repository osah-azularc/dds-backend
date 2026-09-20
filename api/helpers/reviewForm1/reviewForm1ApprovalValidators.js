import Joi from 'joi';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Request-body validation schemas for the Form 1 review
                approve/reject endpoints. Follows the same pattern as
                osahForm1Validators.js / docketDetailPageValidators.js.
*/

const requiredPositiveInt = Joi.number().integer().positive().required();
const optionalReasonText = Joi.string().trim().allow('').max(2000).optional();

export const reviewFormApproveSchema = Joi.object({
  form1Id: requiredPositiveInt.messages({
    'any.required': 'form1Id is required',
    'number.base': 'form1Id must be a number',
    'number.positive': 'form1Id must be a positive number',
  }),
  approveReason: optionalReasonText.messages({
    'string.max': 'approveReason cannot exceed 2000 characters',
  }),
  // Optional — only sent when the client has already picked an NOH type/date/time
  // (docket creation and NOH generation happen together in this one call).
  nohType: Joi.string().trim().max(255).optional(),
  newHearingDate: Joi.string().trim().max(20).optional(),
  newHearingTime: Joi.string().trim().max(20).optional(),
}).unknown(false);

export const reviewFormRejectSchema = Joi.object({
  form1Id: requiredPositiveInt.messages({
    'any.required': 'form1Id is required',
    'number.base': 'form1Id must be a number',
    'number.positive': 'form1Id must be a positive number',
  }),
  rejectReason: optionalReasonText.messages({
    'string.max': 'rejectReason cannot exceed 2000 characters',
  }),
  rejectReasonType: Joi.string().trim().max(255).required().messages({
    'any.required': 'rejectReasonType is required',
    'string.empty': 'rejectReasonType is required',
  }),
}).unknown(false);
