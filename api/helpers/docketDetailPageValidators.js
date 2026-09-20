import Joi from 'joi';
import { docketNumberSchema } from './validators.js';

/**
 * Docket Detail Page Validators
 * Created By: Snehal Narkar
 * Created: 2026-04-03
 * Description: Joi validation schemas for docket detail file operations
 * Pattern: Follows osahForm1Validators.js pattern
 */

// ── Reusable primitives ───────────────────────────────────────────────────────
const positiveInt = Joi.number().integer().positive();
const requiredPositiveInt = positiveInt.required();
const sanitizedString = Joi.string().trim().max(5000);
const requiredSummaryNotes = Joi.string().trim().max(5000).required();

// ── Get Document Schema ───────────────────────────────────────────────────────
/**
 * Validates getDocument request
 * Matches PHP: Osahform/getfile
 * @body { docket_number: string|number, doc_id: number }
 */
const getDocumentSchema = Joi.object({
  docketNumber: docketNumberSchema.required()
    .messages({
      'any.required': 'docketNumber is required',
      'string.pattern.base': 'docketNumber must be a valid case ID',
      'string.max': 'docketNumber must be a valid case ID',
    }),
  docId: requiredPositiveInt.messages({
    'any.required': 'docId is required',
    'number.positive': 'docId must be positive',
  }),
}).unknown(false);

export const validateGetDocument = (data) => {
  return getDocumentSchema.validate(data, { abortEarly: false });
};

// ── Party Details Schema ──────────────────────────────────────────────────────
const partyDetailsSchema = Joi.object({
  docketNo: docketNumberSchema.required().messages({
    'any.required': 'docketNo is required',
    'string.pattern.base': 'docketNo must be a valid case ID',
    'string.max': 'docketNo must be a valid case ID',
  }),
}).unknown(false);

export const validatePartyDetailsRequest = (data) => {
  return partyDetailsSchema.validate(data, { abortEarly: false });
};

// ── Update Document Schema ────────────────────────────────────────────────────
/**
 * Validates updateDocument request
 */
const updateDocumentDataSchema = Joi.object({
  updateDocId: requiredPositiveInt.messages({
    'any.required': 'updateDocId is required',
    'number.positive': 'updateDocId must be positive',
  }),
  docketNumber: docketNumberSchema.required()
    .messages({
      'any.required': 'docketNumber is required',
      'string.pattern.base': 'docketNumber must be a valid case ID',
      'string.max': 'docketNumber must be a valid case ID',
    }),
  fileName: sanitizedString.allow('', null).optional(),
  descriptionHistory: sanitizedString.allow('', null).optional(),
  isSealedHistory: Joi.string().valid('0', '1').allow('', null).optional(),
  docFlag: Joi.string().allow('', null).optional(),
}).unknown(true); // Allow additional fields for history tracking

const updateDocumentFileInfoSchema = Joi.object({
  description: sanitizedString.allow('', null).optional().messages({
    'string.max': 'Description cannot exceed 5000 characters',
  }),
  isSealed: Joi.string().valid('0', '1').required().messages({
    'any.required': 'isSealed is required',
    'any.only': 'isSealed must be either "0" or "1"',
  }),
}).unknown(false);

const updateDocumentSchema = Joi.object({
  data: updateDocumentDataSchema.required().messages({
    'any.required': 'data object is required',
  }),
  fileInfo: updateDocumentFileInfoSchema.required().messages({
    'any.required': 'fileInfo object is required',
  }),
}).unknown(false);

export const validateUpdateDocument = (data) => {
  return updateDocumentSchema.validate(data, { abortEarly: false });
};

// ── Add Document Schema ───────────────────────────────────────────────────────
/**
 * Validates addDocument (docket "+ Files" upload) request.
 * Matches PHP: Osahform/addfile (existing ClamAV S3/SQS pipeline hand-off).
 * fileSize is passed in separately by the controller from req.file.size.
 */
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 250 * 1024 * 1024;

const addDocumentSchema = Joi.object({
  docketNumber: docketNumberSchema.required().messages({
    'any.required': 'docketNumber is required',
    'string.pattern.base': 'docketNumber must be a valid case ID',
    'string.max': 'docketNumber must be a valid case ID',
  }),
  documentType: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'documentType is required',
    'string.empty': 'documentType is required',
    'string.max': 'documentType cannot exceed 100 characters',
  }),
  dateFiled: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    'any.required': 'dateFiled is required',
    'string.pattern.base': 'dateFiled must be in YYYY-MM-DD format',
  }),
  description: sanitizedString.allow('', null).optional(),
  isSealed: Joi.string().valid('0', '1').required().messages({
    'any.required': 'isSealed is required',
    'any.only': 'isSealed must be either "0" or "1"',
  }),
  fileSize: Joi.number().integer().positive().max(MAX_DOCUMENT_FILE_SIZE_BYTES).required().messages({
    'any.required': 'File is required',
    'number.max': 'File exceeds the 250 MB limit',
  }),
}).unknown(false);

export const validateAddDocument = (data) => {
  return addDocumentSchema.validate(data, { abortEarly: false });
};

// ── Docket History Schema ──────────────────────────────────────────────────────
export const getHistoryDataSchema = Joi.object({
  docketId: docketNumberSchema.required().messages({
    'any.required': 'docketId is required',
    'string.pattern.base': 'docketId must be a valid case ID',
    'string.max': 'docketId must be a valid case ID',
  }),
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(10),
  sortBy: Joi.string().valid('date', 'createdTime', 'description', 'modifiedBy').optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').optional().default('desc'),
}).unknown(false);

export const validateGetHistoryDataRequest = (data) => {
  return getHistoryDataSchema.validate(data, { abortEarly: false });
};

// ── Pending / Rejected Documents Schema ───────────────────────────────────────
/**
 * Validates pending/rejected documents request
 * @body { docketId: number, page?: number, limit?: number, sortBy?: string, sortOrder?: string }
 */
export const getRejectedPendingDocumentsSchema = Joi.object({
  docketId: docketNumberSchema.required().messages({
    'any.required': 'docketId is required',
    'string.pattern.base': 'docketId must be a valid case ID',
    'string.max': 'docketId must be a valid case ID',
  }),
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(20),
  sortBy: Joi.string()
    .valid('documentType', 'documentName', 'dateSubmitted', 'status', 'description', 'rejectedReason')
    .optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').optional().default('desc'),
}).unknown(false);

// ── Docket Notes Schemas ──────────────────────────────────────────────────────
export const getDocketNotesSchema = Joi.object({
  caseId: requiredPositiveInt.messages({
    'any.required': 'caseId is required',
    'number.base': 'caseId must be a number',
    'number.integer': 'caseId must be an integer',
    'number.positive': 'caseId must be a positive number',
  }),
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(10),
  sortBy: Joi.string().valid('date', 'summaryNotes', 'updatedBy').optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').optional().default('desc'),
}).unknown(false);

export const addDocketNoteSchema = Joi.object({
  caseId: requiredPositiveInt.messages({
    'any.required': 'caseId is required',
    'number.base': 'caseId must be a number',
    'number.integer': 'caseId must be an integer',
    'number.positive': 'caseId must be a positive number',
  }),
  summaryNotes: requiredSummaryNotes.messages({
    'any.required': 'summaryNotes is required',
    'string.empty': 'summaryNotes is required',
    'string.max': 'summaryNotes cannot exceed 5000 characters',
  }),
}).unknown(false);

export const updateDocketNoteSchema = Joi.object({
  noteId: requiredPositiveInt.messages({
    'any.required': 'noteId is required',
    'number.base': 'noteId must be a number',
    'number.integer': 'noteId must be an integer',
    'number.positive': 'noteId must be a positive number',
  }),
  summaryNotes: requiredSummaryNotes.messages({
    'any.required': 'summaryNotes is required',
    'string.empty': 'summaryNotes is required',
    'string.max': 'summaryNotes cannot exceed 5000 characters',
  }),
}).unknown(false);

export const deleteDocketNoteSchema = Joi.object({
  noteId: requiredPositiveInt.messages({
    'any.required': 'noteId is required',
    'number.base': 'noteId must be a number',
    'number.integer': 'noteId must be an integer',
    'number.positive': 'noteId must be a positive number',
  }),
}).unknown(false);

