
import {
  getBulkEditDropdownDataHelper,
  bulkUpdateDocketsHelper,
} from '../helpers/bulkEditHelper.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Get dropdown data for bulk edit modal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getBulkEditDropdownData = async (req, res) => {
  try {
    const data = await getBulkEditDropdownDataHelper();
    res.json(data);
  } catch (error) {
    logger.error('Error in getBulkEditDropdownData controller:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
};

/**
 * Bulk update dockets
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const bulkUpdateDockets = async (req, res) => {
  try {
    const { formData, docketIds } = req.body;

    // Validate request body
    if (!formData || !docketIds) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'formData and docketIds are required',
      });
    }

    const result = await bulkUpdateDocketsHelper(formData, docketIds, req.email);
    res.json(result);
  } catch (error) {
    logger.error('Error in bulkUpdateDockets controller:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
};
