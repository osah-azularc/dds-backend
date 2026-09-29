import {
  validateAddDdsDocket,
  validateSearchDocketInfo,
  validateGetForm1Id,
  validateUpdateDdsDocket,
  validateDeleteDocket,
} from '../helpers/ddsForm1Validators.js';
import ddsForm1Service from '../services/ddsForm1Service.js';
import { resolveUserDisplayName } from '../helpers/resolveUserDisplayName.js';
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

/**
 * Loads a Form 1 docket + its parties for the review screen.
 * @route POST /dds-form1/searchdocketinfo
 */
export const searchDocketInfoHandler = async (req, res) => {
  try {
    const { form1Id } = validateSearchDocketInfo(req.body);
    const data = await ddsForm1Service.searchDocketInfo(form1Id);

    return res.status(200).json(data);
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
      });
    }

    // Matches the legacy action's catch block (`echo "404"; exit;`), which
    // the Angular frontend checks for as a literal string response body.
    logger.error('Error in searchDocketInfoHandler (dds-form1):', error);
    return res.status(200).send('404');
  }
};

/**
 * Resolves the form1_id for a given eCourt docket/case id, for the Home
 * page header's "Docket Number" quick search (DocketSearch.jsx) to navigate
 * to /form1/reqdt/:form1Id.
 * @route POST /dds-form1/getForm1Id
 */
export const getForm1IdHandler = async (req, res) => {
  try {
    const { docketId } = validateGetForm1Id(req.body);
    const form1Id = await ddsForm1Service.getForm1IdByEcourtCaseId(docketId);

    return res.status(200).json({
      success: true,
      message: form1Id ? 'Form 1 found' : 'No records found',
      data: form1Id ? { form1Id } : null,
      error: null,
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: null,
        error: error.message,
      });
    }

    logger.error('Error in getForm1IdHandler (dds-form1):', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: null,
      error: 'Internal server error',
    });
  }
};

/**
 * Saves the Temporary Permit edits made on the existing-docket review
 * screen.
 * @route POST /dds-form1/updatedocket
 */
export const updateDocketHandler = async (req, res) => {
  try {
    const { form1Id, docketdetails } = validateUpdateDdsDocket(req.body);
    await ddsForm1Service.updateDocket(form1Id, docketdetails, resolveUserDisplayName(req));

    return res.status(200).json({ success: true, message: 'Form 1 updated successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
      });
    }

    logger.error('Error in updateDocketHandler (dds-form1):', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Internal server error',
    });
  }
};

/**
 * Deletes a Form1 docket entirely ("Delete Form1" on the existing-docket review
 * screen, only shown/enabled for a still-Draft docket).
 * @route POST /dds-form1/deletedocket
 */
export const deleteDocketHandler = async (req, res) => {
  try {
    const { form1Id } = validateDeleteDocket(req.body);
    await ddsForm1Service.deleteDocket(form1Id);

    return res.status(200).json({ success: true, message: 'Form 1 deleted successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
      });
    }

    logger.error('Error in deleteDocketHandler (dds-form1):', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'Internal server error',
    });
  }
};
