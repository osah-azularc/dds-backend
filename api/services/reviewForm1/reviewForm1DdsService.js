/**
 * @module reviewForm1DdsService
 * @description DDS-specific (agency_platform_id == 5) data for the Form 1
 *              review/detail screen, plus NOH (Notice of Hearing) type lookup
 *              for the review/approve screen — split out from
 *              reviewForm1Service.js to keep new code in its own file. Mirrors
 *              the form1205data / docketAdditonalNotes portions of legacy
 *              Reviewform1Controller::reviewformdata().
 */
import Form1Dds1205Offence from '../../models/Form1Dds1205Offence.js';
import Form1Summarytable from '../../models/Form1Summarytable.js';
import { logger } from '../../../config/winstonLogger.js';
import {
  getMatchedCasetypeMappings,
  getMappingAutomations,
} from '../documentTemplateMappingService.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : DDS-specific (agency_platform_id 5) Form 1205 offense data,
                docket notes, and NOH type lookup for the review/approve screen.
*/

const toMmDdYyyy = (value) => {
  if (!value) return '';
  const isoString = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoString);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${month}-${day}-${year}`;
};

// Mirrors PHP's CASE WHEN incident_time IS NULL OR 'null' OR 'NaN:NaN:NaN' THEN ''
// ELSE TIME_FORMAT(incident_time,'%h:%i %p') END.
const toHourMinuteAmPm = (value) => {
  if (!value || value === 'null' || value === 'NaN:NaN:NaN') return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return '';
  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
};

/**
 * @param {number} form1Id
 * @returns {Promise<object>} form1205data shaped like the legacy payload
 *          (empty object when no row exists, matching legacy's array())
 */
export const getForm1205Data = async (form1Id) => {
  const row = await Form1Dds1205Offence.findOne({ where: { form1Id }, raw: true });
  if (!row) return {};

  return {
    citiation: row.citiation,
    county_of_occurences: row.countyOfOccurences,
    incident_date: toMmDdYyyy(row.incidentDate),
    incident_time: toHourMinuteAmPm(row.incidentTime),
    officer_badge_number: row.officerBadgeNumber,
    commercial_vehicle: row.commercialVehicle,
    hazourdous_vehicle: row.hazourdousVehicle,
    state_of_issue: row.stateOfIssue,
    license_class_id: row.licenseClassId,
    dob: toMmDdYyyy(row.dob),
    restrictions: row.restrictions,
    gender: row.gender,
    height: row.height,
    weight: row.weight,
    driver_request: row.driverRequest,
  };
};

/**
 * @param {number} form1Id
 * @returns {Promise<Array<{date: string, summarynotes: string, updatedby: string}>>}
 */
export const getDocketAdditionalNotes = async (form1Id) => {
  const rows = await Form1Summarytable.findAll({ where: { form1Id }, raw: true });
  return rows.map((row) => ({
    date: toMmDdYyyy(row.date),
    summarynotes: row.summaryNotes,
    updatedby: row.updatedBy,
  }));
};

/**
 * Get the list of available NOH (Notice of Hearing) automation subtypes for
 * the given agency/casetype, sourced from the same Admin-managed mapping
 * tables that generateNOH() (nohQuickActionHelper.js) resolves its template
 * from — keeps the "NOH Type" dropdown in sync with what approval can
 * actually generate.
 *
 * @param {string} refAgency
 * @param {string} caseType
 * @returns {Promise<string[]>}
 */
export const getNohTypesForForm1 = async (refAgency, caseType) => {
  if (!refAgency || !caseType) {
    return [];
  }

  try {
    const mappings = await getMatchedCasetypeMappings([refAgency], [caseType]);
    if (!mappings.length) {
      return [];
    }

    const mappingIds = mappings.map((m) => m.id);
    const automations = await getMappingAutomations(mappingIds, 'noh');

    return [...new Set(automations.map((a) => a.automationSubType).filter(Boolean))];
  } catch (error) {
    logger.error('[ReviewForm1DdsService] Error fetching NOH types:', error);
    return [];
  }
};
