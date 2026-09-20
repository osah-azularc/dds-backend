/*
  Created by  : Snehal Narkar
  Date        : 2026-08-27
  Description : Factory for the standard 4-handler admin controller (list/details/save/
                status-toggle) shared by the Time & Expense admin CRUD entities (Billable
                Agencies, Time Entry Tasks, Expense Types) — previously each entity
                copy-pasted the same four handler bodies, differing only in which helper
                functions they called and the entity name in messages/log prefixes.
*/
import {
  sendEntityListResult,
  sendEntityResult,
  sendEntityServerError,
} from './adminCrudResponseHelpers.js';

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * @param {object} helpers
 * @param {() => Promise<object[]>} helpers.getList
 * @param {(id: number) => Promise<object|null>} helpers.getDetails
 * @param {(formData: object) => Promise<object|null>} helpers.save
 * @param {(id: number, status: string) => Promise<object|null>} helpers.setStatus
 * @param {object} config
 * @param {string} config.entityLabel - lowercase singular, e.g. "billable agency"
 * @param {string} config.entityLabelPlural - lowercase plural, e.g. "billable agencies"
 * @returns {{getList, getDetails, save, setStatus}} Express route handlers
 */
export function makeAdminEntityController(
  { getList: fetchList, getDetails: fetchDetails, save: persist, setStatus: persistStatus },
  { entityLabel, entityLabelPlural },
) {
  const label = capitalize(entityLabel);
  const labelPlural = capitalize(entityLabelPlural);

  async function getList(req, res) {
    try {
      const items = await fetchList();
      return sendEntityListResult(res, items, {
        emptyMessage: `No ${entityLabelPlural} found`,
        successMessage: `${labelPlural} fetched successfully`,
      });
    } catch (error) {
      return sendEntityServerError(res, error, {
        logPrefix: `Error fetching ${entityLabel} list:`,
        message: `Failed to fetch ${entityLabelPlural}`,
        emptyResult: [],
      });
    }
  }

  async function getDetails(req, res) {
    try {
      const item = await fetchDetails(req.body.id);
      return sendEntityResult(res, item, {
        notFoundMessage: `${label} not found`,
        successMessage: `${label} fetched successfully`,
      });
    } catch (error) {
      return sendEntityServerError(res, error, {
        logPrefix: `Error fetching ${entityLabel} details:`,
        message: `Failed to fetch ${entityLabel} details`,
      });
    }
  }

  async function save(req, res) {
    try {
      const item = await persist(req.body);
      return sendEntityResult(res, item, {
        notFoundMessage: `${label} not found`,
        successMessage: req.body.id ? `${label} updated successfully` : `${label} added successfully`,
      });
    } catch (error) {
      return sendEntityServerError(res, error, {
        logPrefix: `Error saving ${entityLabel}:`,
        message: `Failed to save ${entityLabel}`,
      });
    }
  }

  async function setStatus(req, res) {
    try {
      const item = await persistStatus(req.body.id, req.body.statusActiveInActive);
      return sendEntityResult(res, item, {
        notFoundMessage: `${label} not found`,
        successMessage: `${label} status updated successfully`,
      });
    } catch (error) {
      return sendEntityServerError(res, error, {
        logPrefix: `Error updating ${entityLabel} status:`,
        message: `Failed to update ${entityLabel} status`,
      });
    }
  }

  return { getList, getDetails, save, setStatus };
}
