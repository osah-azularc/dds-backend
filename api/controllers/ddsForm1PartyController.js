import {
  validateAddDdsParty,
  validateEditDdsParty,
  validateAutopopulateDdsParty,
  validateGetPartyAutofillDetails,
  validateGetPartyList,
  validateDeleteDdsParty,
} from '../helpers/ddsForm1PartyValidators.js';
import ddsForm1PartyService from '../services/ddsForm1PartyService.js';
import { resolveUserDisplayName } from '../helpers/resolveUserDisplayName.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Adds a party to the existing-docket review screen's Party Information section.
 * @route POST /dds-form1/addPartyDDSDetails
 */
export const addPartyHandler = async (req, res) => {
  try {
    const { form1Id, partydetails } = validateAddDdsParty(req.body);
    await ddsForm1PartyService.addParty(form1Id, partydetails, req.userId, resolveUserDisplayName(req));

    return res.status(200).json({ success: true, message: 'Party added successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in addPartyHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Edits an existing party on the docket.
 * @route POST /dds-form1/editpartydetails
 */
export const editPartyHandler = async (req, res) => {
  try {
    const { form1Id, partyId, partydetails } = validateEditDdsParty(req.body);
    await ddsForm1PartyService.editParty(
      form1Id,
      partyId,
      partydetails,
      req.userId,
      resolveUserDisplayName(req),
    );

    return res.status(200).json({ success: true, message: 'Party updated successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in editPartyHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Last Name autocomplete suggestions for the Petitioner Attorney contact type.
 * @route POST /dds-form1/autopopulatedds
 */
export const autopopulatePartyHandler = async (req, res) => {
  try {
    const { contactType } = validateAutopopulateDdsParty(req.body);
    const data = await ddsForm1PartyService.autopopulateParty(contactType);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in autopopulatePartyHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Full attorney record for a selected Last Name autocomplete suggestion.
 * @route POST /dds-form1/getddsinformation
 */
export const getPartyAutofillHandler = async (req, res) => {
  try {
    const { partyId } = validateGetPartyAutofillDetails(req.body);
    const data = await ddsForm1PartyService.getPartyAutofillDetails(partyId);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in getPartyAutofillHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Every party on a Form1 docket, for the Party Information section -- a separate endpoint
 * from searchdocketinfo, matching legacy's own separate getPartyDetailsAction().
 * @route POST /dds-form1/get-party-details
 */
export const getPartyListHandler = async (req, res) => {
  try {
    const { form1Id } = validateGetPartyList(req.body);
    const data = await ddsForm1PartyService.getPartyList(form1Id);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in getPartyListHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Deletes a party from a Form1 docket.
 * @route POST /dds-form1/deleteparty
 */
export const deletePartyHandler = async (req, res) => {
  try {
    const { form1Id, partyId, contactType } = validateDeleteDdsParty(req.body);
    await ddsForm1PartyService.deleteParty(form1Id, partyId, contactType, resolveUserDisplayName(req));

    return res.status(200).json({ success: true, message: 'Party deleted successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in deletePartyHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};
