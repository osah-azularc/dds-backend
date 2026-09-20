/*
  Created by  : Snehal Narkar
  Date        : 2026-09-02
  Description : Joi validation schemas for the Review & Post endpoints (period list/status,
                per-user summary, entry list + bulk actions, CSV export).
*/
import Joi from 'joi';
import { dateStringDashboardSchema } from '../../../validators.js';

const periodsBodySchema = Joi.object({
  statusFilter: Joi.string().valid('All', 'Open', 'Inreview', 'Closed').optional().default('All'),
  year: Joi.number().integer().allow(null).optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  // Deliberately not legacy's own default (reviewpost.phtml's widget defaults to 50) -- 10 is
  // this module's default everywhere, matching Level 2/3; 300 is still the max, legacy's own
  // pagination widget ceiling.
  pageSize: Joi.number().integer().min(1).max(300).optional().default(10),
}).unknown(false);

// Every id here (periodId/userId) travels in the POST body, never a URL :id/:userId segment
// -- per explicit user instruction, applied consistently across every Review & Post endpoint.
const updateStatusBodySchema = Joi.object({
  periodId: Joi.number().integer().positive().required(),
  statusId: Joi.number().integer().valid(1, 2, 3).required(),
}).unknown(false);

const userSummaryBodySchema = Joi.object({
  periodId: Joi.number().integer().positive().required(),
  userId: Joi.number().integer().positive().allow(null).optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(10),
}).unknown(false);

const entriesBodySchema = Joi.object({
  periodId: Joi.number().integer().positive().required(),
  userId: Joi.number().integer().positive().required(),
  task: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('0', '1', '2', '3').optional(),
  sortOrder: Joi.string().valid('ASC', 'DESC').optional().default('ASC'),
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(10),
}).unknown(false);

const bulkIdsBodySchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required().messages({
    'array.min': 'Please select at least one entry',
    'any.required': 'Please select at least one entry',
  }),
}).unknown(false);

const exportQuerySchema = Joi.object({
  dateFrom: dateStringDashboardSchema.required(),
  dateTo: dateStringDashboardSchema.required(),
}).unknown(false);

export {
  periodsBodySchema,
  updateStatusBodySchema,
  userSummaryBodySchema,
  entriesBodySchema,
  bulkIdsBodySchema,
  exportQuerySchema,
};
