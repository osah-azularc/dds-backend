import {
  validateUpdateDdsToDps,
  validateAddPartyDetails,
  validateAddAttorneyRespondent,
  validateSearch1205Info,
} from '../helpers/ddsForm1205Validators.js';
import ddsForm1205Service from '../services/ddsForm1205Service.js';
import { resolveUserDisplayName } from '../helpers/resolveUserDisplayName.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Marks a Form 1205 docket as sent to DPS (the last step of Submit).
 * @route POST /dds-form1/updateddstodps
 */
export const updateDdsToDpsHandler = async (req, res) => {
  try {
    const { form1Id } = validateUpdateDdsToDps(req.body);
    await ddsForm1205Service.updateDdsToDps(form1Id);

    return res.status(200).json({ success: true, message: 'Docket sent to DPS' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in updateDdsToDpsHandler (dds-form1205):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Saves either the Form 1205 screen's Officer Information or Incident Information section,
 * dispatched by `contactType` -- matching legacy's own frontend, which posts to this exact
 * same URL twice per Save/Submit (once per section) rather than using two endpoints.
 * @route POST /dds-form1/addPartyDetails
 */
export const addPartyDetailsHandler = async (req, res) => {
  try {
    const parsed = validateAddPartyDetails(req.body);

    if (parsed.contactType === 'Officer') {
      const data = await ddsForm1205Service.addOfficerPartyDetails(parsed.form1Id, parsed.officerDetails);
      return res.status(200).json({ success: true, message: 'Officer information saved successfully', data });
    }

    const { incidentDetails } = parsed;
    const finalStatus = incidentDetails.buttonStatus === 'submit' ? 'submitted' : 'pending';
    await ddsForm1205Service.saveIncidentInformation(parsed.form1Id, incidentDetails, finalStatus);
    return res.status(200).json({ success: true, message: 'Incident information saved successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in addPartyDetailsHandler (dds-form1205):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Attaches DDS's standard Respondent Attorney to the docket (Submit).
 * @route POST /dds-form1/addattorneyrespondent
 */
export const addAttorneyRespondentHandler = async (req, res) => {
  try {
    const { form1Id } = validateAddAttorneyRespondent(req.body);
    const data = await ddsForm1205Service.addAttorneyRespondent(form1Id, resolveUserDisplayName(req));

    return res.status(200).json({ success: true, message: 'Respondent Attorney added', data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in addAttorneyRespondentHandler (dds-form1205):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Loads the docket's Officer Information + 1205 offence data, for prefilling the Form 1205
 * screen on an existing docket.
 * @route POST /dds-form1/search1205info
 */
export const search1205InfoHandler = async (req, res) => {
  try {
    const { form1Id } = validateSearch1205Info(req.body);
    const data = await ddsForm1205Service.search1205Info(form1Id);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in search1205InfoHandler (dds-form1205):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};
