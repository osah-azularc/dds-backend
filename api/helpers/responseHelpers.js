/**
 * Centralized response helper functions for consistent API responses
 * @module responseHelpers
 */

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {*} data - Response data (optional)
 * @param {number} status - HTTP status code (default: 200)
 * @returns {Object} JSON response
 */
export const sendSuccess = (res, message, data = null, status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
    error: null,
  });
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {*} error - Error details (optional)
 * @param {number} status - HTTP status code (default: 500)
 * @returns {Object} JSON response
 */
export const sendError = (res, message, error = null, status = 500) => {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    error,
  });
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 * @param {*} errors - Validation error details
 * @returns {Object} JSON response
 */
export const sendValidationError = (res, message = 'Validation error', errors = null) => {
  return sendError(res, message, errors, 400);
};

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {string} message - Not found message
 * @returns {Object} JSON response
 */
export const sendNotFound = (res, message = 'Resource not found') => {
  return sendError(res, message, null, 404);
};

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 * @returns {Object} JSON response
 */
export const sendUnauthorized = (res, message = 'Unauthorized access') => {
  return sendError(res, message, null, 401);
};

/**
 * Send forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 * @returns {Object} JSON response
 */
export const sendForbidden = (res, message = 'Access forbidden') => {
  return sendError(res, message, null, 403);
};
