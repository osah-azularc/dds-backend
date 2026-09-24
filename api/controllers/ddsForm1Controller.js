import { validateAddDdsDocket } from '../helpers/ddsForm1Validators.js';
import ddsForm1Service from '../services/ddsForm1Service.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Creates a new DDS Form 1 docket (the "Enter New Form 1" screen).
 * @route POST /dds-form1/adddocket
 */
export const addDocketHandler = async (req, res) => {
  try {
    const { docketdetails } = validateAddDdsDocket(req.body);
    const result = await ddsForm1Service.addDocket(docketdetails, req.userId);

    return res.status(200).json({
      success: true,
      message: 'Form 1 created successfully',
      ...result,
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
      });
    }

    logger.error('Error in addDocketHandler (dds-form1):', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Internal server error',
    });
  }
};
