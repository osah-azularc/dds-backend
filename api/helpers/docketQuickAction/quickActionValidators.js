import Joi from 'joi';

const baseFields = {
  agencyCode: Joi.string().required().messages({
    'any.required': 'Required fields agencyCode should not be empty.',
    'string.empty': 'Required fields agencyCode should not be empty.',
  }),
  casetype: Joi.string().required().messages({
    'any.required': 'Required fields casetype should not be empty.',
    'string.empty': 'Required fields casetype should not be empty.',
  }),
  automationSubType: Joi.string().required().messages({
    'any.required': 'Required fields automationSubType should not be empty.',
    'string.empty': 'Required fields automationSubType should not be empty.',
  }),
  caseId: Joi.number().integer().positive().required().messages({
    'any.required': 'Required fields caseId should not be empty.',
    'number.base': 'Required fields caseId should not be empty.',
  }),
  caseName: Joi.string().required().messages({
    'any.required': 'Required fields caseName should not be empty.',
    'string.empty': 'Required fields caseName should not be empty.',
  }),
  agencyId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Required fields agencyId should not be empty.',
  }),
  caseTypeId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
    'any.required': 'Required fields caseTypeId should not be empty.',
  }),
};

/**
 * Shared Joi schema for NOH and Continuance quick action endpoints.
 * Both endpoints accept identical fields so a single schema covers both.
 */
export const quickActionSchema = Joi.object({
  ...baseFields,
  allParties: Joi.array().items(Joi.string()).min(1).required().messages({
    'any.required': 'Required fields allParties should not be empty.',
    'array.min': 'Required fields allParties should not be empty.',
  }),
  newHearingDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'any.required': 'Required fields newHearingDate should not be empty.',
      'string.empty': 'Required fields newHearingDate should not be empty.',
      'string.pattern.base': 'newHearingDate must be in YYYY-MM-DD format.',
    }),
  newHearingTime: Joi.string()
    .pattern(/^\d{2}:\d{2}(:\d{2})?$/)
    .required()
    .messages({
      'any.required': 'Required fields newHearingTime should not be empty.',
      'string.empty': 'Required fields newHearingTime should not be empty.',
      'string.pattern.base': 'newHearingTime must be in HH:mm or HH:mm:ss format.',
    }),
  getDateReceived: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'any.required': 'Required fields getDateReceived should not be empty.',
      'string.empty': 'Required fields getDateReceived should not be empty.',
      'string.pattern.base': 'getDateReceived must be in YYYY-MM-DD format.',
    }),
  judge: Joi.string().required().messages({
    'any.required': 'Required fields judge should not be empty.',
    'string.empty': 'Required fields judge should not be empty.',
  }),
  cma: Joi.string().required().messages({
    'any.required': 'Required fields cma should not be empty.',
    'string.empty': 'Required fields cma should not be empty.',
  }),
}).options({ stripUnknown: true });

/**
 * Joi schema for Disposition quick action.
 * Disposition does not need newHearingDate/newHearingTime — it closes the case.
 */
export const dispositionSchema = Joi.object({
  ...baseFields,
  allParties: Joi.array().items(Joi.string()).optional().default([]),
  getDateReceived: Joi.string().allow('').pattern(/^\d{4}-\d{2}-\d{2}$/).optional().default('').messages({
    'string.pattern.base': 'getDateReceived must be in YYYY-MM-DD format.',
  }),
  judge: Joi.string().allow('').default(''),
  cma:   Joi.string().allow('').default(''),
}).options({ stripUnknown: true });
