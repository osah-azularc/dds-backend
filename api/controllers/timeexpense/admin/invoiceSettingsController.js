/*
  Created by  : Snehal Narkar
  Date        : 2026-08-31
  Description : Admin Invoice Settings controller (Time & Expense).
                Matches PHP TimeExpense/getinvoiceSettingsDetailsAction /
                uploadInvoiceTemplateAction — see invoiceSettingsHelper.js.
*/
import {
  getInvoiceSettingsDetails as fetchInvoiceSettingsDetails,
  saveInvoiceSettings as persistInvoiceSettings,
} from '../../../helpers/timeexpense/admin/invoiceSettingsHelper.js';
import { sendEntityResult, sendEntityServerError } from './adminCrudResponseHelpers.js';

/** Fetch the invoice settings singleton row. */
export async function getInvoiceSettingsDetails(req, res) {
  try {
    const settings = await fetchInvoiceSettingsDetails();
    return sendEntityResult(res, settings, {
      notFoundMessage: 'Invoice settings not found',
      successMessage: 'Invoice settings fetched successfully',
    });
  } catch (error) {
    return sendEntityServerError(res, error, {
      logPrefix: 'Error fetching invoice settings details:',
      message: 'Failed to fetch invoice settings details',
    });
  }
}

/** Update the invoice settings singleton row, including writing a newly-picked logo to EFS. */
export async function saveInvoiceSettings(req, res) {
  try {
    const settings = await persistInvoiceSettings(req.body);
    return sendEntityResult(res, settings, {
      notFoundMessage: 'Invoice settings not found',
      successMessage: 'Invoice settings updated successfully',
    });
  } catch (error) {
    return sendEntityServerError(res, error, {
      logPrefix: 'Error saving invoice settings:',
      message: 'Failed to save invoice settings',
    });
  }
}
