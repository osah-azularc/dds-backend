/*
  Created by  : Snehal Narkar
  Date        : 2026-08-10
  Description : Admin Billing Roles controller (Time & Expense).
                Matches PHP TimeExpense/getTimeEntryBillingRolesList, getBillingRolesDetails,
                and saveBillabletasksform (rate-only, see billingRolesHelper.js).
*/
import {
  getBillingRolesList as fetchBillingRolesList,
  getBillingRoleDetails as fetchBillingRoleDetails,
  updateBillingRoleRate as persistBillingRoleRate,
} from '../../../helpers/timeexpense/admin/billingRolesHelper.js';
import {
  sendEntityListResult,
  sendEntityResult,
  sendEntityServerError,
} from './adminCrudResponseHelpers.js';

/**
 * List all Time & Expense billing roles.
 * Matches PHP: TimeExpense/getTimeEntryBillingRolesList
 */
export async function getBillingRolesList(req, res) {
  try {
    const roles = await fetchBillingRolesList();
    return sendEntityListResult(res, roles, {
      emptyMessage: 'No billing roles found',
      successMessage: 'Billing roles fetched successfully',
    });
  } catch (error) {
    return sendEntityServerError(res, error, {
      logPrefix: 'Error fetching billing roles list:',
      message: 'Failed to fetch billing roles',
      emptyResult: [],
    });
  }
}

/**
 * Fetch a single billing role's details by id.
 * Matches PHP: TimeExpense/getBillingRolesDetails
 */
export async function getBillingRoleDetails(req, res) {
  try {
    const role = await fetchBillingRoleDetails(req.body.id);
    return sendEntityResult(res, role, {
      notFoundMessage: 'Billing role not found',
      successMessage: 'Billing role fetched successfully',
    });
  } catch (error) {
    return sendEntityServerError(res, error, {
      logPrefix: 'Error fetching billing role details:',
      message: 'Failed to fetch billing role details',
    });
  }
}

/**
 * Update a billing role's rate per hour.
 * Matches PHP: TimeExpense/saveBillabletasksform (edit mode) — scoped to ratePerHour only,
 * see updateBillingRoleRate for why.
 */
export async function updateBillingRoleRate(req, res) {
  try {
    const role = await persistBillingRoleRate(req.body.id, req.body.ratePerHour);
    return sendEntityResult(res, role, {
      notFoundMessage: 'Billing role not found',
      successMessage: 'Rate per hour updated successfully',
    });
  } catch (error) {
    return sendEntityServerError(res, error, {
      logPrefix: 'Error updating billing role rate:',
      message: 'Failed to update rate per hour',
    });
  }
}
