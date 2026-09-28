import Joi from 'joi';
import { ValidationError } from './validators.js';

/*
  Validates the existing-docket review screen's Notes tab
  (/form1/notes/reqdt/:form1Id). Ports DdsForm1Controller's Notes/Summary
  actions (addNotesAction/updatenotesAction/deletenotesAction), plus the
  Notes-fetch usage of Osahform::getdatadynamicAction() (a generic raw-SQL
  table query builder) as its own dedicated, Sequelize-backed endpoint.
*/

const idParam = Joi.alternatives()
  .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
  .required();

const NOTE_SORT_FIELDS = ['date', 'summaryNotes', 'updatedBy'];

const getNotesSchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  page: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid(...NOTE_SORT_FIELDS).default('date'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc'),
}).unknown(false);

export function validateGetNotes(data) {
  const { error, value } = getNotesSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'getNotes');
  }

  return {
    form1Id: Number.parseInt(value.form1Id, 10),
    page: value.page,
    limit: value.limit,
    sortBy: value.sortBy,
    sortOrder: value.sortOrder,
  };
}

// Consolidated Add/Edit endpoint (noteId absent -> create, present -> update) -- ports
// addNotesAction() and updatenotesAction() as one call, per the user's request.
const saveNoteSchema = Joi.object({
  form1Id: idParam.messages({ 'any.required': 'form1Id is required' }),
  noteId: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().pattern(/^\d+$/))
    .optional(),
  summaryNotes: Joi.string().max(10000).trim().required().messages({
    'any.required': 'Notes/Summary is required',
    'string.empty': 'Notes/Summary is required',
    'string.max': 'Notes/Summary must not exceed 10000 characters',
  }),
}).unknown(false);

export function validateSaveNote(data) {
  const { error, value } = saveNoteSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'saveNote');
  }

  return {
    form1Id: Number.parseInt(value.form1Id, 10),
    noteId: value.noteId ? Number.parseInt(value.noteId, 10) : null,
    summaryNotes: value.summaryNotes,
  };
}

// Ports deletenotesAction() -- legacy's own key is `notes_id`; this uses `noteId` for
// consistency with this screen's other newer endpoints.
const deleteNoteSchema = Joi.object({
  noteId: idParam.messages({ 'any.required': 'noteId is required' }),
}).unknown(false);

export function validateDeleteNote(data) {
  const { error, value } = deleteNoteSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((e) => e.message).join(', '), 'deleteNote');
  }

  return { noteId: Number.parseInt(value.noteId, 10) };
}
