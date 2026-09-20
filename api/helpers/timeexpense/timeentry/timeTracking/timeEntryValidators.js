/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Joi validation schemas for the Time Entry endpoints (calendar reads + day-form
                mutations). Wired via the existing generic validateBody/validateParams
                middleware from invoicingValidators.js -- reused rather than reimplemented a
                third time (see the Time Tracking Audit's backend-conventions research: two
                such factories already exist, Admin's and Invoicing's; this module is closer
                in shape to Invoicing's calendar/list endpoints).
*/
import Joi from 'joi';
import { requiredPositiveInt, optionalText, dateStringDashboardSchema } from '../../../validators.js';

const monthBodySchema = Joi.object({
  firstDay: dateStringDashboardSchema.required(),
  lastDay: dateStringDashboardSchema.required(),
}).unknown(false);

const weekBodySchema = Joi.object({
  startDate: dateStringDashboardSchema.required(),
  endDate: dateStringDashboardSchema.required(),
}).unknown(false);

const dayBodySchema = Joi.object({
  date: dateStringDashboardSchema.required(),
}).unknown(false);

const checkPeriodBodySchema = Joi.object({
  date: dateStringDashboardSchema.required(),
}).unknown(false);

const optionsBodySchema = Joi.object({}).unknown(false);

// Matches legacy's getTimeEntryByIdAction / getTimeEntryActivityByIdAction -- both read the
// id from the POST body ($param['timeEntryId']), not a URL path segment.
const timeEntryIdBodySchema = Joi.object({
  timeEntryId: requiredPositiveInt,
}).unknown(false);

// Shared by add/edit/duplicate -- the day form's own field set.
const timeEntryFormSchema = Joi.object({
  userId: Joi.number().integer().positive().allow(null).optional(),
  task: requiredPositiveInt,
  agency: Joi.array().items(Joi.string()).min(1).required().messages({
    'array.min': 'Please select Agency',
    'any.required': 'Please select Agency',
  }),
  agencyIds: Joi.array().items(Joi.number().integer()).optional().default([]),
  agencyCodes: Joi.array().items(Joi.string()).optional().default([]),
  datefrom: dateStringDashboardSchema.required(),
  hours: Joi.number().integer().min(0).max(23).required(),
  minutes: Joi.number().integer().min(0).max(59).required(),
  description: optionalText,
})
  .unknown(false)
  .custom((value, helpers) => {
    // Matches legacy's "hours==00 && minutes==00" validation rule.
    if (value.hours === 0 && value.minutes === 0) {
      return helpers.message('Please enter either hours or minutes');
    }
    return value;
  });

// edit/duplicate take timeEntryId in the body instead of a URL :id segment (per user
// instruction to keep every id out of the path, matching getTimeEntryByIdAction above).
const editTimeEntryBodySchema = timeEntryFormSchema.keys({ timeEntryId: requiredPositiveInt });
const duplicateTimeEntryBodySchema = timeEntryFormSchema.keys({ timeEntryId: requiredPositiveInt });

// Shared by submit and approve -- both bodies are either just { timeEntryId } (submit's
// create-then-submit/duplicate-then-submit path, and bulk approve, which has no
// field-editing UI) or the full form too (editing an existing entry and hitting Submit sends
// it here directly; approving from the day form can resend edited field values alongside the
// status flip, matching legacy's approveTimeentryFormAction) -- every field beyond
// timeEntryId stays optional for that reason, identically for both actions.
const optionalTimeEntryBodySchema = Joi.object({
  timeEntryId: requiredPositiveInt,
  userId: Joi.number().integer().positive().allow(null).optional(),
  task: Joi.number().integer().positive().optional(),
  agency: Joi.array().items(Joi.string()).optional(),
  agencyIds: Joi.array().items(Joi.number().integer()).optional(),
  agencyCodes: Joi.array().items(Joi.string()).optional(),
  datefrom: dateStringDashboardSchema.optional(),
  hours: Joi.number().integer().min(0).max(23).optional(),
  minutes: Joi.number().integer().min(0).max(59).optional(),
  description: optionalText,
}).unknown(false);

const submitTimeEntryBodySchema = optionalTimeEntryBodySchema;
const approveBodySchema = optionalTimeEntryBodySchema;

const rejectBodySchema = Joi.object({
  timeEntryId: requiredPositiveInt,
  comments: optionalText,
}).unknown(false);

export {
  monthBodySchema,
  weekBodySchema,
  dayBodySchema,
  checkPeriodBodySchema,
  optionsBodySchema,
  timeEntryIdBodySchema,
  timeEntryFormSchema,
  editTimeEntryBodySchema,
  duplicateTimeEntryBodySchema,
  submitTimeEntryBodySchema,
  approveBodySchema,
  rejectBodySchema,
};
