/**
 * caseContextBuilderService.js
 *
 * Builds the resolver context object for a given case ID.
 * Fetches Docket, HearingTime, and party rows in parallel then assembles
 * the shape expected by coreResolvers.js.
 *
 * Throws an Error with .code = 'CASE_NOT_FOUND' when no docket row exists.
 * Never logs; callers are responsible for error handling.
 */

import { Op } from 'sequelize';
import moment from 'moment';
import Docket from '../../../models/Docket.js';
import HearingTime from '../../../models/calendar/HearingTimeModel.js';
import PeopleDetails from '../../../models/PeopleDetails.js';
import CourtLocations from '../../../models/CourtLocations.js';
import JudgeAssistantClerk from '../../../models/JudgeAssistantClerk.js';
import Casetypes from '../../../models/Casetypes.js';
import CaseTypeStyling from '../../../models/admin/caseTypeStylingModel.js';
import { buildSelectedPartyAddresses } from './selectedPartyAddressBuilder.js';

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Formats a date value as MM-DD-YYYY. Returns '' for invalid/missing.
 * Applied to hearing.dateFormatted (pre-formatted before entering context).
 * @param {string|Date|null} value
 * @returns {string}
 */
function formatDateMMDDYYYY(value) {
  if (!value) return '';
  const m = moment(value);
  return m.isValid() ? m.format('MM-DD-YYYY') : '';
}

/**
 * Formats a raw HH:mm:ss string to display time (e.g. "9:00 AM").
 * Used as fallback when hearingTimeId is 0 or missing.
 * @param {string|null} value
 * @returns {string}
 */
function formatTimeDisplay(value) {
  if (!value) return '';
  const m = moment(value, 'HH:mm:ss', true);
  return m.isValid() ? m.format('h:mm A') : '';
}

/**
 * Constructs a full name from raw DB row fields.
 * No company fallback.
 * @param {{ firstname: string|null, lastname: string|null }} row
 * @returns {string}
 */
function buildPartyName(row) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim().toUpperCase();
}

/**
 * Formats a phone string to NXX-NXX-XXXX. Returns '' for blank input.
 * @param {string|null} raw
 * @returns {string}
 */
function formatPhone(raw) {
  if (!raw) return '';
  return raw.replaceAll(/^(\d{3})(\d{3})(\d{4})$/g, '$1-$2-$3');
}

/**
 * Fetches CMA contact details from judge_assistant_clerk.
 * Splits judgeAssistant string ("Lastname Firstname") into name parts.
 * Returns empty strings on any error or missing row.
 * @param {string} judgeAssistant
 * @returns {Promise<{ firstName: string, lastName: string, phone: string, fax: string, email: string }>}
 */
const toTitleCase = (str) =>
  str ? str.toLowerCase().replaceAll(/\b\w/g, (c) => c.toUpperCase()) : '';

// DB stores judge/judgeassistant as "LastName FirstName" — reorder for document display.
function reorderLastFirst(str) {
  if (!str) return '';
  const lastSpace = str.lastIndexOf(' ');
  if (lastSpace < 0) return str;
  return `${str.substring(lastSpace + 1).trim()} ${str.substring(0, lastSpace).trim()}`.trim();
}

async function fetchCmaForContext(judgeAssistant) {
  if (!judgeAssistant) return { firstName: '', lastName: '', phone: '', fax: '', email: '' };
  const lastSpace = judgeAssistant.lastIndexOf(' ');
  const cmaFirst = toTitleCase(lastSpace >= 0 ? judgeAssistant.substring(lastSpace + 1).trim() : judgeAssistant.trim());
  const cmaLast  = toTitleCase(lastSpace >= 0 ? judgeAssistant.substring(0, lastSpace).trim() : '');
  try {
    const row = await JudgeAssistantClerk.findOne({
      attributes: ['phone', 'fax', 'email'],
      where: {
        firstName: { [Op.like]: `%${cmaFirst}%` },
        lastName:  { [Op.like]: `%${cmaLast}%` },
        userType: 'cma',
        isActive: '1',
      },
      raw: true,
    });
    return {
      firstName: cmaFirst,
      lastName:  cmaLast,
      phone: formatPhone(row?.phone),
      fax:   formatPhone(row?.fax),
      email: row?.email || '',
    };
  } catch {
    return { firstName: cmaFirst, lastName: cmaLast, phone: '', fax: '', email: '' };
  }
}

/**
 * Fetches court location address details by hearing site name.
 * Returns empty strings on any error or missing row.
 * @param {string} hearingSite
 * @returns {Promise<{ siteName: string, address: string, cityStateZip: string }>}
 */
async function fetchLocationForContext(hearingSite) {
  if (!hearingSite) return { siteName: '', address: '', cityStateZip: '' };
  try {
    const loc = await CourtLocations.findOne({
      attributes: ['address1', 'address2', 'city', 'state', 'zip'],
      where: { locationName: { [Op.like]: `%${hearingSite}%` } },
      raw: true,
    });
    const address = loc
      ? (loc.address2 ? `${loc.address1}\n${loc.address2}` : (loc.address1 || ''))
      : '';
    const cityStateZip = loc?.city ? `${loc.city}, ${loc.state}  ${loc.zip}` : '';
    return { siteName: toTitleCase(hearingSite), address, cityStateZip };
  } catch {
    return { siteName: toTitleCase(hearingSite), address: '', cityStateZip: '' };
  }
}

/**
 * Builds a formatted mailing list string from all PeopleDetails rows for a case.
 * Entries are separated by five newlines (mirrors PHP layout for address labels).
 * @param {number} caseId
 * @returns {Promise<string>}
 */
async function fetchMailingForContext(caseId) {
  try {
    const rows = await PeopleDetails.findAll({
      attributes: ['firstName', 'lastName', 'title', 'company', 'address1', 'address2',
                   'city', 'state', 'zip', 'isInternationalAddr', 'internationalAddress'],
      where: { caseId },
      raw: true,
    });
    if (!rows.length) return '';

    const buildEntry = (row) => {
      const name   = `${(row.firstName || '').trim()} ${(row.lastName || '').trim()}`.trim().toUpperCase();
      const prefix = ((row.company || '').trim() || (row.title || '').trim()).toUpperCase();
      if (row.isInternationalAddr === '1' && row.internationalAddress) {
        return [name, prefix, (row.internationalAddress || '').trim().toUpperCase()].filter(Boolean).join('\n');
      }
      const addr1 = (row.address1 || '').trim().toUpperCase();
      const addr2 = (row.address2 || '').trim().toUpperCase();
      const city  = (row.city  || '').trim().toUpperCase();
      const state = (row.state || '').trim().toUpperCase();
      const zip   = (row.zip   || '').trim().toUpperCase();
      const cityStateZip = `${city}${city ? ', ' : ' '}${state} ${zip}`.trim();
      return [name, prefix, addr1, addr2, cityStateZip].filter(Boolean).join('\n');
    };

    return rows.map(buildEntry).join('\n\n\n\n\n');
  } catch {
    return '';
  }
}

/**
 * PHP fallback: when no petitioner/claimant row exists in peopledetails,
 * look up the default petitioner label from casetypestyling.
 * Resolves caseType string → Casetypes row → CaseTypeStyling.petitioner.
 * @param {string|null} caseType - docket.caseType (e.g. 'DFCS-M')
 * @returns {Promise<string>}
 */
async function fetchCaseTypeStylingPetitioner(caseType) {
  if (!caseType) return '';
  try {
    const ct = await Casetypes.findOne({
      attributes: ['caseTypeId', 'agencyId'],
      where: { caseCode: caseType },
      raw: true,
    });
    if (!ct) return '';
    const styling = await CaseTypeStyling.findOne({
      attributes: ['petitioner'],
      where: { caseTypeId: ct.caseTypeId, agencyId: ct.agencyId },
      raw: true,
    });
    return styling?.petitioner || '';
  } catch {
    return '';
  }
}

/**
 * Fetches petitioner and respondent names for a case.
 * Mirrors PHP logic: queries by caseid (not docket_caseid), with claimant and
 * casetypestyling fallbacks.
 *
 * @param {number} caseId
 * @param {string|null} caseType - docket.caseType used for casetypestyling fallback
 * @returns {Promise<{ petitionerName: string, respondentName: string }>}
 */
async function fetchParties(caseId, caseType) {
  const rows = await PeopleDetails.findAll({
    where: {
      caseId,
      typeOfContact: { [Op.in]: ['Petitioner', 'petitioner', 'Respondent', 'respondent', 'Claimant', 'claimant'] },
    },
    attributes: ['firstName', 'lastName', 'typeOfContact'],
    raw: true,
  });

  const lowerType = (r) => (r.typeOfContact || '').toLowerCase();
  const petitionerRow  = rows.find((r) => lowerType(r) === 'petitioner')
                      ?? rows.find((r) => lowerType(r) === 'claimant')
                      ?? null;
  const respondentRow  = rows.find((r) => lowerType(r) === 'respondent');
  const petitionerName = petitionerRow
    ? buildPartyName(petitionerRow)
    : await fetchCaseTypeStylingPetitioner(caseType);

  return {
    petitionerName,
    respondentName: respondentRow ? buildPartyName(respondentRow) : '',
  };
}

/**
 * Resolves the display hearing time string.
 * - hearingTimeId > 0: look up HearingTime table (display string already stored).
 * - Otherwise: format the raw hearingTime column (HH:mm:ss → h:mm A).
 *
 * @param {{ hearingTimeId: number, hearingTime: string|null }} docket
 * @returns {Promise<string>}
 */
async function resolveHearingTime(docket) {
  if (docket.hearingTimeId > 0) {
    const htRow = await HearingTime.findByPk(docket.hearingTimeId, { raw: true });
    return htRow?.hearingTime ?? '';
  }
  return formatTimeDisplay(docket.hearingTime);
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Builds the full resolver context for a given case.
 *
 * The returned object satisfies the shape consumed by coreResolvers.js:
 *   context.parties  — petitionerName, respondentName, selectedPartyAddresses
 *   context.case     — caseId, docketNumber, agencyRefNumber, uniqueCode, dateRequested
 *   context.hearing  — dateFormatted, timeFormatted, officerName, judgeName
 *   context.location — siteName, address, cityStateZip
 *   context.cma      — firstName, lastName, phone, fax, email
 *   context.mailing  — list
 *   context.system   — currentDate
 *
 * @param {number} caseId - The docket case ID
 * @param {object} [overrides] - Optional field overrides (used by NOH generation for new hearing date/time)
 * @param {string} [overrides.hearingDate] - Override hearing date (ISO string, replaces DB value)
 * @param {string} [overrides.hearingTime] - Override hearing time (HH:mm:ss, replaces DB value)
 * @param {Array<{source: string, id: string|number}>} [overrides.selectedMailerParties] - Docket Mailer List selection; when supplied, selectedPartyAddresses is built from exactly these parties instead of the default Respondent/Petitioner/Officer set
 * @returns {Promise<object>} Resolver context object
 * @throws {Error} With .code = 'CASE_NOT_FOUND' if no docket row exists
 */
export async function buildCaseContext(caseId, overrides = {}) {
  const docket = await Docket.findOne({
    where: { caseId },
    attributes: [
      'caseId',
      'docketNumber',
      'agencyRefNumber',
      'uniqueCode',
      'dateRequested',
      'hearingDate',
      'hearingTime',
      'hearingTimeId',
      'judge',
      'judgeAssistant',
      'hearingSite',
      'caseType',
    ],
    raw: true,
  });

  if (!docket) {
    const err = new Error(`No docket found for caseId ${caseId}`);
    err.code = 'CASE_NOT_FOUND';
    throw err;
  }

  // Use override hearing date/time when provided (NOH generation sets new values)
  const effectiveHearingDate = overrides.hearingDate ?? docket.hearingDate;
  const effectiveHearingTime = overrides.hearingTime ?? docket.hearingTime;
  const effectiveDocket = { ...docket, hearingDate: effectiveHearingDate, hearingTime: effectiveHearingTime };

  const [parties, timeFormatted, location, cma, mailingList, selectedPartyAddresses] = await Promise.all([
    fetchParties(caseId, docket.caseType),
    resolveHearingTime(effectiveDocket),
    fetchLocationForContext(docket.hearingSite),
    fetchCmaForContext(docket.judgeAssistant),
    fetchMailingForContext(caseId),
    buildSelectedPartyAddresses(caseId, overrides.selectedMailerParties),
  ]);

  // Hearing date formatted as "MMMM D, YYYY" for NOH templates (e.g. "January 15, 2026")
  const hearingDateFormatted = effectiveHearingDate
    ? moment(effectiveHearingDate).format('MMMM D, YYYY')
    : '';

  return {
    parties: {
      petitionerName: parties.petitionerName,
      respondentName: parties.respondentName,
      selectedPartyAddresses,
    },
    case: {
      caseId:           docket.caseId,
      docketNumber:     docket.docketNumber     ?? '',
      agencyRefNumber:  docket.agencyRefNumber  ?? String(docket.caseId),
      uniqueCode:       docket.uniqueCode       ?? '',
      dateRequested:    docket.dateRequested,
    },
    hearing: {
      dateFormatted: hearingDateFormatted,
      timeFormatted,
      officerName:   'Undefined', // TODO: replace with confirmed hearing officer source
      judgeName:     reorderLastFirst(docket.judge ?? ''),
    },
    location: {
      siteName:     location.siteName,
      address:      location.address,
      cityStateZip: location.cityStateZip,
    },
    cma: {
      firstName: cma.firstName,
      lastName:  cma.lastName,
      phone:     cma.phone,
      fax:       cma.fax,
      email:     cma.email,
    },
    mailing: {
      list: mailingList,
    },
    system: {
      currentDate: new Date(),
    },
  };
}
