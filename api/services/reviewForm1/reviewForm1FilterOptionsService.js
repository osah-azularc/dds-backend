/**
 * @module reviewForm1FilterOptionsService
 * @description Filter-dropdown options, bulk clerk assignment, and Additional
 *              Info/Toll violation figures for the Review Form 1s screen.
 */
import Form1Docket from '../../models/Form1Docket.js';
import AgencyPlatform from '../../models/admin/agencyPlatformModel.js';
import AgencyPlatformCasetype from '../../models/AgencyPlatformCasetype.js';
import Casetypes from '../../models/Casetypes.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import AdditionalInfo from '../../models/AdditionalInfo.js';
import AdditionalInfoMaster from '../../models/AdditionalInfoMaster.js';
import TollViolations from '../../models/TollViolations.js';
import { Op, Sequelize } from 'sequelize';
import { logger } from '../../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Filter-dropdown option lists (agency/case type/status/clerk),
                bulk clerk assignment, and "Additional Info"/Toll violation
                figures for the Review Form 1s screen.
*/

// Agency comes from agency_platform (id/name) so zero-submission agencies still show.
/**
 * @returns {Promise<{value: number, label: string}[]>}
 */
export const getAgenciesList = async () => {
  try {
    const agencies = await AgencyPlatform.findAll({
      attributes: ['id', 'name'],
      raw: true,
    });

    return agencies
      .filter((item) => item.name)
      .map((item) => ({ value: item.id, label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching agencies:', error);
    return [];
  }
};

/** Get list of unique case types. */
export const getCaseTypesList = async () => {
  try {
    const caseTypes = await Form1Docket.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('caseType')), 'caseType']],
      where: {
        caseType: { [Op.not]: null },
      },
      raw: true,
    });

    return caseTypes.map((item) => item.caseType).filter(Boolean);
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching case types:', error);
    return [];
  }
};

// Case types configured for the platform (agency_platform_casetype), not just ones with submissions.
/**
 * @param {(number|string)[]|number|string} agencyPlatformIds
 * @returns {Promise<string[]>}
 */
export const getCaseTypesByAgencies = async (agencyPlatformIds = []) => {
  let agencyList = [];

  if (Array.isArray(agencyPlatformIds)) {
    agencyList = agencyPlatformIds.filter((value) => !!value);
  } else if (agencyPlatformIds) {
    agencyList = [agencyPlatformIds];
  }

  if (!agencyList.length) {
    return [];
  }

  try {
    const mappings = await AgencyPlatformCasetype.findAll({
      where: { agencyPlatformId: { [Op.in]: agencyList } },
      attributes: ['caseTypeId'],
      raw: true,
    });
    const caseTypeIds = [...new Set(mappings.map((m) => m.caseTypeId))];
    if (!caseTypeIds.length) {
      return [];
    }

    const caseTypes = await Casetypes.findAll({
      where: { caseTypeId: { [Op.in]: caseTypeIds } },
      attributes: ['caseCode'],
      raw: true,
    });

    return [...new Set(caseTypes.map((ct) => ct.caseCode).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching case types by agencies:', error);
    return [];
  }
};

/** Get list of unique statuses. */
export const getStatusesList = async () => {
  try {
    const statuses = await Form1Docket.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('status')), 'status']],
      where: {
        status: { [Op.not]: null },
      },
      raw: true,
    });

    return statuses.map((item) => item.status).filter(Boolean);
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching statuses:', error);
    return [];
  }
};

// These two accounts are excluded from the Staff clerk list (mirrors legacy filter).
const EXCLUDED_CLERK_EMAILS = new Set(['azularc2@osah.ga.gov', 'azularc5@osah.ga.gov']);

// Only excludes FirstName='Test' — inactive clerks still appear (mirrors legacy).
/**
 * @returns {Promise<{value: string, label: string}[]>}
 */
export const getClerksList = async () => {
  try {
    const clerks = await JudgeAssistantClerk.findAll({
      where: { userType: 'clerk', firstName: { [Op.ne]: 'Test' } },
      attributes: ['firstName', 'lastName', 'email'],
      raw: true,
    });

    return clerks
      .filter((c) => c.email && !EXCLUDED_CLERK_EMAILS.has(String(c.email).toLowerCase()))
      // Sorted by raw LastName descending, not the "Lastname, Firstname" label.
      .sort((a, b) => (b.lastName || '').localeCompare(a.lastName || ''))
      .map((c) => ({
        value: String(c.email).split('@')[0],
        label: c.lastName && c.firstName
          ? `${c.lastName}, ${c.firstName}`
          : (c.lastName || c.firstName || c.email),
      }));
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching clerks:', error);
    return [];
  }
};

/** Get all filter options at once. */
export const getAllFilterOptions = async () => {
  try {
    const [agencies, caseTypes, statuses, clerks] = await Promise.all([
      getAgenciesList(),
      getCaseTypesList(),
      getStatusesList(),
      getClerksList(),
    ]);

    return {
      agencies,
      caseTypes,
      statuses,
      clerks,
    };
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching filter options:', error);
    return {
      agencies: [],
      caseTypes: [],
      statuses: [],
      clerks: [],
    };
  }
};

/**
 * Bulk-assign a clerk to a list of Form 1 records.
 * @param {number[]} form1Ids
 * @param {string} clerk
 * @returns {Promise<number>} affected row count
 */
export const updateForm1ClerkAssignments = async (form1Ids = [], clerk = '') => {
  if (!Array.isArray(form1Ids) || form1Ids.length === 0 || !clerk) {
    return 0;
  }

  try {
    const [affectedCount] = await Form1Docket.update(
      { docketClerk: clerk },
      {
        where: {
          form1Id: { [Op.in]: form1Ids },
        },
      },
    );

    return affectedCount;
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error assigning clerk to Form 1s:', error);
    throw error;
  }
};

/**
 * @param {number} form1Id
 * @param {number|string} agencyPlatformId
 * @returns {Promise<{additionalinfo: number[], additionalinfolabel: object[]}>}
 */
export async function getAdditionalInfoForForm1(form1Id, agencyPlatformId) {
  try {
    const additionalRows = await AdditionalInfo.findAll({
      where: { form1Id },
      attributes: ['additionalInfoId'],
      raw: true,
    });
    const additionalinfo = additionalRows.map((row) => row.additionalInfoId);

    const labelRows = await AdditionalInfoMaster.findAll({
      where: { agencyPlatformId },
      attributes: ['id', 'label'],
      raw: true,
    });
    const additionalinfolabel = labelRows.map((row) => ({
      ...row,
      checked: additionalinfo.includes(row.id) ? 1 : '',
    }));

    return { additionalinfo, additionalinfolabel };
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching additional info:', error);
    return { additionalinfo: [], additionalinfolabel: [] };
  }
}

/**
 * @param {number} form1Id
 * @returns {Promise<{no_of_violations: any, toll_fees: any, statutory_fees: any}|null>}
 */
export async function getTollViolationsForForm1(form1Id) {
  try {
    const toll = await TollViolations.findOne({
      where: { form1Id },
      attributes: ['noOfViolations', 'tollFees', 'statutoryFees'],
      raw: true,
    });
    if (!toll) return null;
    return {
      no_of_violations: toll.noOfViolations,
      toll_fees: toll.tollFees,
      statutory_fees: toll.statutoryFees,
    };
  } catch (error) {
    logger.error('[ReviewForm1FilterOptionsService] Error fetching toll violations:', error);
    return null;
  }
}
