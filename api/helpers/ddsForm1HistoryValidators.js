import Joi from 'joi';
import { ValidationError } from './validators.js';

/*
  Validates the existing-docket review screen's History tab
  (/form1/history/reqdt/:form1Id). Ports
  DdsForm1Controller::getDdsHistoryDataAction() as a paginated/sortable
  Sequelize query instead of that action's raw SQL SELECT.
*/

const idParam = Joi.alternatives()
  .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
  .required();

const HISTORY_SORT_FIELDS = ['date', 'createdTime', 'description', 'modifiedBy'];

const getHistorySchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  page: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid(...HISTORY_SORT_FIELDS).default('date'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc'),
}).unknown(false);

export function validateGetHistory(data) {
  const { error, value } = getHistorySchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getHistory');
  }

  return {
    form1Id: Number.parseInt(value.form1Id, 10),
    page: value.page,
    limit: value.limit,
    sortBy: value.sortBy,
    sortOrder: value.sortOrder,
  };
}
