import { validateGetHistory } from '../helpers/ddsForm1HistoryValidators.js';
import ddsForm1HistoryService from '../services/ddsForm1HistoryService.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Audit-trail list for the History tab.
 * @route POST /dds-form1/get-history
 */
export const getHistoryHandler = async (req, res) => {
  try {
    const { form1Id, page, limit, sortBy, sortOrder } = validateGetHistory(req.body);
    const data = await ddsForm1HistoryService.getHistoryList(form1Id, { page, limit, sortBy, sortOrder });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in getHistoryHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};
