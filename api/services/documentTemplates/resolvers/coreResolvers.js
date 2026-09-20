/**
 * coreResolvers.js
 *
 * Pure resolver functions for legacy_core merge fields.
 * All functions are synchronous, side-effect-free, and return '' for
 * missing/null inputs. No external dependencies; no imports from other
 * resolver files.
 */

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Safely converts a value to string. Returns '' for null/undefined.
 * @param {*} value
 * @returns {string}
 */
function safeString(value) {
  return value == null ? '' : String(value);
}

/**
 * Formats a date value as MM-DD-YYYY. Returns '' for invalid/missing.
 * @param {string|Date} value
 * @returns {string}
 */
function formatDateMMDDYYYY(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());

  return `${month}-${day}-${year}`;
}

/**
 * Returns day with ordinal suffix (1st, 2nd, 3rd, 4th…).
 * @param {number} day
 * @returns {string}
 */
function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return `${day}th`;

  const lastDigit = day % 10;
  if (lastDigit === 1) return `${day}st`;
  if (lastDigit === 2) return `${day}nd`;
  if (lastDigit === 3) return `${day}rd`;

  return `${day}th`;
}

/**
 * Formats a date as "Month, YYYY" (e.g., "October, 2025").
 * @param {string|Date} value
 * @returns {string}
 */
function formatMonthYear(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();

  return `${month}, ${year}`;
}

// ─── Exported resolvers ──────────────────────────────────────────────────────

/**
 * Resolves petitioner's full name from context.parties.
 * @param {object} context
 * @returns {string}
 */
export function resolvePetitionerName(context) {
  return safeString(context?.parties?.petitionerName);
}

/**
 * Resolves respondent's full name from context.parties.
 * @param {object} context
 * @returns {string}
 */
export function resolveRespondentName(context) {
  return safeString(context?.parties?.respondentName);
}

/**
 * Resolves case ID from context.case.
 * @param {object} context
 * @returns {string}
 */
export function resolveCaseId(context) {
  return safeString(context?.case?.caseId);
}

/**
 * Resolves formatted docket number: {caseId}-OSAH-{trimmedDocketNumber}.
 * Strips redundant caseId prefix from docketNumber if present.
 * @param {object} context
 * @returns {string}
 */
export function resolveDocketNumber(context) {
  const caseId = safeString(context?.case?.caseId);
  const docketNumber = safeString(context?.case?.docketNumber);

  if (!caseId || !docketNumber) return '';

  // Remove ALL occurrences of "{caseId}-" (mirrors PHP str_replace behaviour).
  // A single .slice() only removes the leading prefix, leaving duplicates mid-string.
  const trimmed = docketNumber.replaceAll(`${caseId}-`, '');
  return `${caseId}-OSAH-${trimmed}`;
}

/**
 * Resolves date requested in MM-DD-YYYY format.
 * @param {object} context
 * @returns {string}
 */
export function resolveDateRequested(context) {
  return formatDateMMDDYYYY(context?.case?.dateRequested);
}

/**
 * Resolves pre-formatted hearing date from context.hearing.
 * @param {object} context
 * @returns {string}
 */
export function resolveHearingDate(context) {
  return safeString(context?.hearing?.dateFormatted);
}

/**
 * Resolves pre-formatted hearing time from context.hearing.
 * @param {object} context
 * @returns {string}
 */
export function resolveHearingTime(context) {
  return safeString(context?.hearing?.timeFormatted);
}

/**
 * Resolves hearing officer name from context.hearing.
 * @param {object} context
 * @returns {string}
 */
export function resolveHearingOfficerName(context) {
  return safeString(context?.hearing?.officerName);
}

/**
 * Resolves judge name from context.hearing.
 * @param {object} context
 * @returns {string}
 */
export function resolveJudgeName(context) {
  return safeString(context?.hearing?.judgeName);
}

/**
 * Resolves current date as MM-DD-YYYY (e.g., "06-10-2026").
 * Uses context.system.currentDate or falls back to new Date().
 * @param {object} context
 * @returns {string}
 */
export function resolveCurrentDate(context) {
  const currentDate = context?.system?.currentDate ?? new Date();
  return formatDateMMDDYYYY(currentDate);
}

/**
 * Resolves current day with ordinal suffix (e.g., "15th").
 * Uses context.system.currentDate or falls back to new Date().
 * @param {object} context
 * @returns {string}
 */
export function resolveCurrentDayWithSuffix(context) {
  const currentDate = context?.system?.currentDate ?? new Date();
  const date = new Date(currentDate);

  if (Number.isNaN(date.getTime())) return '';

  return getOrdinalSuffix(date.getDate());
}

/**
 * Resolves current month and year (e.g., "October, 2025").
 * Uses context.system.currentDate or falls back to new Date().
 * @param {object} context
 * @returns {string}
 */
export function resolveCurrentMonthYear(context) {
  const currentDate = context?.system?.currentDate ?? new Date();
  return formatMonthYear(currentDate);
}

// ─── NOH-specific resolvers ──────────────────────────────────────────────────

export function resolveAgencyRefNumber(context) {
  return safeString(context?.case?.agencyRefNumber);
}

export function resolveUniqueAccessCode(context) {
  return safeString(context?.case?.uniqueCode);
}

export function resolveHearingSiteName(context) {
  return safeString(context?.location?.siteName);
}

export function resolveHearingSiteAddress(context) {
  return safeString(context?.location?.address);
}

export function resolveHearingSiteCityStateZip(context) {
  return safeString(context?.location?.cityStateZip);
}

export function resolveCmaFirstName(context) {
  return safeString(context?.cma?.firstName);
}

export function resolveCmaLastName(context) {
  return safeString(context?.cma?.lastName);
}

export function resolveCmaPhone(context) {
  return safeString(context?.cma?.phone);
}

export function resolveCmaFax(context) {
  return safeString(context?.cma?.fax);
}

export function resolveCmaEmail(context) {
  return safeString(context?.cma?.email);
}

export function resolveMailingList(context) {
  return safeString(context?.mailing?.list);
}

// ─── Selected-party address resolvers (${Address1}-${Address6}) ────────────
// Fixed slots reading context.parties.selectedPartyAddresses (built once in
// caseContextBuilderService.js). No role is pinned to a slot — slot N is
// simply the Nth entry in that ordered collection. Missing slots return ''.

function resolveSelectedPartyAddressSlot(context, index) {
  const list = context?.parties?.selectedPartyAddresses;
  if (!Array.isArray(list)) return '';
  return safeString(list[index]);
}

export function resolveSelectedPartyAddress1(context) {
  return resolveSelectedPartyAddressSlot(context, 0);
}

export function resolveSelectedPartyAddress2(context) {
  return resolveSelectedPartyAddressSlot(context, 1);
}

export function resolveSelectedPartyAddress3(context) {
  return resolveSelectedPartyAddressSlot(context, 2);
}

export function resolveSelectedPartyAddress4(context) {
  return resolveSelectedPartyAddressSlot(context, 3);
}

export function resolveSelectedPartyAddress5(context) {
  return resolveSelectedPartyAddressSlot(context, 4);
}

export function resolveSelectedPartyAddress6(context) {
  return resolveSelectedPartyAddressSlot(context, 5);
}
