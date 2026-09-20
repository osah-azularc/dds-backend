import Joi from "joi";

/**
 * Validation schema for getPendingDocuments endpoint
 * Validates pagination, search, and sorting parameters
 */
export const getPendingDocumentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),
  searchValue: Joi.string().allow("").max(255).default("").messages({
    "string.base": "Search value must be a string",
    "string.max": "Search value cannot exceed 255 characters",
  }),
  sortField: Joi.string()
    .valid("date_submitted", "document_type", "document_name", "caseid", "status", "submitted_by", "petitioner", "respondent")
    .default("date_submitted")
    .messages({
      "string.base": "Sort field must be a string",
      "any.only":
        "Sort field must be one of: date_submitted, document_type, document_name, caseid, status, submitted_by, petitioner, respondent",
    }),
  sortOrder: Joi.string()
    .valid("ASC", "DESC", "asc", "desc")
    .default("DESC")
    .messages({
      "string.base": "Sort order must be a string",
      "any.only": "Sort order must be either ASC or DESC",
    }),
});

/**
 * Validation schema for getHistory endpoint
 * Validates pagination, search, and sorting parameters
 */
export const getHistorySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),
  searchValue: Joi.string().allow("").max(255).default("").messages({
    "string.base": "Search value must be a string",
    "string.max": "Search value cannot exceed 255 characters",
  }),
  sortField: Joi.string()
    .valid("created_date", "created_time", "description", "created_by")
    .default("created_date")
    .messages({
      "string.base": "Sort field must be a string",
      "any.only":
        "Sort field must be one of: created_date, created_time, description, modified_by, created_by",
    }),
  sortOrder: Joi.string()
    .valid("ASC", "DESC", "asc", "desc")
    .default("DESC")
    .messages({
      "string.base": "Sort order must be a string",
      "any.only": "Sort order must be either ASC or DESC",
    }),
});

/**
 * Validation schema for getDocumentDetails endpoint
 * Validates document ID parameter
 */
export const getDocumentDetailsSchema = Joi.object({
  documentId: Joi.number().integer().positive().required().messages({
    "number.base": "Document ID must be a number",
    "number.integer": "Document ID must be an integer",
    "number.positive": "Document ID must be a positive number",
    "any.required": "Document ID is required",
  }),
});

/**
 * Validation schema for reviewDocument endpoint
 * Validates document review/approval data
 */
export const reviewDocumentSchema = Joi.object({
  documentId: Joi.number().integer().positive().required().messages({
    "number.base": "Document ID must be a number",
    "number.integer": "Document ID must be an integer",
    "number.positive": "Document ID must be a positive number",
    "any.required": "Document ID is required",
  }),
  action: Joi.string().valid("approve", "reject").required().messages({
    "string.base": "Action must be a string",
    "any.only": "Action must be either 'approve' or 'reject'",
    "any.required": "Action is required",
  }),
  rejectReason: Joi.when('action', {
    is: 'reject',
    then: Joi.string().trim().min(1).required().messages({
      "string.base": "Reject reason must be a string",
      "string.empty": "Reject reason cannot be empty",
      "string.min": "Reject reason is required",
      "any.required": "Reject reason is required when rejecting a document",
    }),
    otherwise: Joi.optional()
  }),
  documentTableData: Joi.object({
    status: Joi.string().optional(),
    document_name: Joi.string().trim().max(170).messages({
      "string.base": "Document name must be a string",
      "string.max": "Document name cannot exceed 170 characters",
    }),
    document_type: Joi.string().trim().messages({
      "string.base": "Document type must be a string",
    }),
    description: Joi.string().allow('', null).max(500).optional().messages({
      "string.base": "Description must be a string",
      "string.max": "Description cannot exceed 500 characters",
    }),
    formStatusDesc: Joi.string().optional(),
    assignedTo: Joi.number().allow(null).optional(),
  })
    .unknown(true)
    .required()
    .messages({
      "object.base": "Document table data must be an object",
      "any.required": "Document table data is required",
    }),
  commonData: Joi.object({
    caseid: Joi.number().integer().positive().required().messages({
      "number.base": "Case ID must be a number",
      "number.integer": "Case ID must be an integer",
      "number.positive": "Case ID must be a positive number",
      "any.required": "Case ID is required",
    }),
    documentId: Joi.number().integer().positive().required().messages({
      "number.base": "Document ID must be a number",
      "number.integer": "Document ID must be an integer",
      "number.positive": "Document ID must be a positive number",
      "any.required": "Document ID is required",
    }),
    documentActivity: Joi.string().trim().max(500).required().messages({
      "string.base": "Document activity must be a string",
      "string.max": "Document activity cannot exceed 500 characters",
      "any.required": "Document activity is required",
    }),
  })
    .unknown(true)
    .required()
    .messages({
      "object.base": "Common data must be an object",
      "any.required": "Common data is required",
    }),
  history: Joi.object({
    description: Joi.string().trim().min(1).required().messages({
      "string.base": "History description must be a string",
      "string.empty": "History description cannot be empty",
      "string.min": "History description is required",
      "any.required": "History description is required",
    }),
  })
    .unknown(true)
    .required()
    .messages({
      "object.base": "History must be an object",
      "any.required": "History is required",
    }),
})
  .unknown(false)
  .messages({
    "object.unknown": "Unknown field: {#label}",
  });

/**
 * Validation schema for downloadDocument endpoint
 * Validates document ID parameter
 */
export const downloadDocumentSchema = Joi.object({
  documentId: Joi.number().integer().positive().required().messages({
    "number.base": "Document ID must be a number",
    "number.integer": "Document ID must be an integer",
    "number.positive": "Document ID must be a positive number",
    "any.required": "Document ID is required",
  }),
});

/**
 * Validation schema for checkFileExists endpoint
 * Validates file path
 */
export const checkFileExistsSchema = Joi.object({
  filePath: Joi.string().required().max(500).messages({
    "string.base": "File path must be a string",
    "string.empty": "File path cannot be empty",
    "string.max": "File path cannot exceed 500 characters",
    "any.required": "File path is required",
  }),
});

/**
 * Validation schema for getCaseDocuments endpoint
 * Validates case ID parameter
 */
export const getCaseDocumentsSchema = Joi.object({
  caseid: Joi.number().integer().positive().required().messages({
    "number.base": "Case ID must be a number",
    "number.integer": "Case ID must be an integer",
    "number.positive": "Case ID must be a positive number",
    "any.required": "Case ID is required",
  }),
});

/**
 * Middleware function to validate request body against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: false, // Keep unknown properties
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        status: 400,
        success: false,
        title: "Validation Error",
        message: "Invalid request data",
        errors: errors,
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Middleware function to validate request params against a Joi schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        status: 400,
        success: false,
        title: "Validation Error",
        message: "Invalid request parameters",
        errors: errors,
      });
    }

    // Replace req.params with validated data
    req.params = value;
    next();
  };
};



