import { logger } from '../../config/winstonLogger.js';

/**
 * Centralized error handler for controllers
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} functionName - Name of the function where error occurred
 * @returns {Object} JSON response
 */
export const handleControllerError = (res, error, functionName) => {
  logger.error(`Error in ${functionName}:`, {
    error: error.message,
    stack: error.stack,
    name: error.name,
  });

  // Handle validation errors
  if (error.name === 'ValidationError' || error.isValidationError) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      error: error.message,
    });
  }

  // Handle Sequelize validation errors (client-supplied data is invalid)
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Database validation error',
      error: error.message,
    });
  }

  // Sequelize database errors (bad SQL, connection issues, constraint violations)
  // are server-side faults, not client errors.
  if (error.name === 'SequelizeDatabaseError') {
    return res.status(500).json({
      success: false,
      message: 'Database error',
      error: error.message,
    });
  }

  // Default server error
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};
