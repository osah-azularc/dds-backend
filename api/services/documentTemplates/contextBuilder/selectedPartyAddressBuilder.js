/**
 * selectedPartyAddressBuilder.js
 *
 * Builds the ordered mailing-address collection consumed by the
 * selected_party_address_1..6 resolvers (legacy ${Address1}-${Address6}).
 *
 * Two modes:
 * - Selection-driven (selectedMailerParties supplied): builds addresses only
 *   for the exact parties the user checked in the docket Mailer List, in
 *   selection order. Sources: peopledetails, agencycaseworkerbycase,
 *   attorneybycase.
 * - Default (no selection supplied): Respondent, Petitioner (peopledetails)
 *   and Officer (agencycaseworkerbycase) — used by Admin/static preview,
 *   NOH, bulk export, and any other caller that predates the Mailer List
 *   wiring.
 *
 * Minors are never included in either mode — they live in a separate
 * minordetails table with no typeofcontact column, and are excluded by
 * construction (not queried in default mode; not a recognized source in
 * selection mode).
 *
 * Each qualifying row produces one formatted address block; a row with a
 * valid alternate domestic address (non-blank altAddress1 — only possible
 * on peopledetails rows) produces a second block immediately after it. The
 * array is not truncated here — the fixed-slot resolvers in coreResolvers.js
 * read indices 0-5 and ignore anything beyond.
 */

import { Op } from 'sequelize';
import PeopleDetails from '../../../models/PeopleDetails.js';
import AgencyCaseworkerByCase from '../../../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../../../models/AttorneyByCase.js';

const PEOPLE_ROLES = ['Petitioner', 'petitioner', 'Respondent', 'respondent'];
const OFFICER_ROLE = 'Officer';

const FORMAT_ATTRIBUTES = [
  'firstName', 'lastName', 'title', 'company',
  'address1', 'address2', 'city', 'state', 'zip',
  'isInternationalAddr', 'internationalAddress',
];

const PEOPLE_ATTRIBUTES = [
  ...FORMAT_ATTRIBUTES,
  'altAddress1', 'altAddress2', 'altCity', 'altState', 'altZipCode',
];

const OFFICER_ATTRIBUTES = FORMAT_ATTRIBUTES;

// Identity resolution for user-selected parties. Mirrors the id derivation
// already used to build the docket party list (partyDetailsHelper.js's
// mapPartyRecord: peopleId ?? contactId ?? minorId ?? attorneyId ?? sno) so
// a party.id sent back from the client matches the row it was built from.
// minordetails is deliberately excluded — Minors must never be selectable.
const MODEL_BY_SOURCE = {
  peopledetails: PeopleDetails,
  agencycaseworkerbycase: AgencyCaseworkerByCase,
  attorneybycase: AttorneyByCase,
};

const QUERY_ATTRIBUTES_BY_SOURCE = {
  peopledetails: [...PEOPLE_ATTRIBUTES, 'peopleId'],
  agencycaseworkerbycase: [...OFFICER_ATTRIBUTES, 'contactId', 'sno'],
  attorneybycase: [...FORMAT_ATTRIBUTES, 'attorneyId', 'sno'],
};

function computePartyRecordId(row) {
  const id = row.peopleId ?? row.contactId ?? row.minorId ?? row.attorneyId ?? row.sno;
  return id == null || id === '' ? null : String(id);
}

const upper = (value) => (value || '').trim().toUpperCase();

function buildCityStateZip(city, state, zip) {
  const c = upper(city);
  const s = upper(state);
  const z = upper(zip);
  return `${c}${c ? ', ' : ' '}${s} ${z}`.trim();
}

function buildNameAndPrefixLines(row) {
  const name = `${row.firstName || ''} ${row.lastName || ''}`.trim().toUpperCase();
  const prefix = upper(row.company) || upper(row.title);
  return [name, prefix];
}

function buildPrimaryEntry(row) {
  const [name, prefix] = buildNameAndPrefixLines(row);
  if (row.isInternationalAddr === '1' && row.internationalAddress) {
    return [name, prefix, upper(row.internationalAddress)].filter(Boolean).join('\n');
  }
  const cityStateZip = buildCityStateZip(row.city, row.state, row.zip);
  return [name, prefix, upper(row.address1), upper(row.address2), cityStateZip]
    .filter(Boolean)
    .join('\n');
}

function buildAltEntry(row) {
  const [name, prefix] = buildNameAndPrefixLines(row);
  const cityStateZip = buildCityStateZip(row.altCity, row.altState, row.altZipCode);
  return [name, prefix, upper(row.altAddress1), upper(row.altAddress2), cityStateZip]
    .filter(Boolean)
    .join('\n');
}

function hasValidAltAddress(row) {
  return Boolean((row.altAddress1 || '').trim());
}

/**
 * Default (no selection supplied) collection: Respondent, Petitioner
 * (peopledetails) and Officer (agencycaseworkerbycase). Used by every
 * caller that doesn't pass a Mailer List selection — Admin/static preview,
 * NOH, bulk export, etc. Unchanged from prior behavior.
 * @param {number} caseId
 * @returns {Promise<string[]>}
 */
async function buildDefaultPartyAddresses(caseId) {
  const [peopleRows, officerRows] = await Promise.all([
    PeopleDetails.findAll({
      attributes: PEOPLE_ATTRIBUTES,
      where: { caseId, typeOfContact: { [Op.in]: PEOPLE_ROLES } },
      raw: true,
    }),
    AgencyCaseworkerByCase.findAll({
      attributes: OFFICER_ATTRIBUTES,
      where: { caseId, typeOfContact: OFFICER_ROLE },
      raw: true,
    }),
  ]);

  const entries = [];
  for (const row of peopleRows) {
    entries.push(buildPrimaryEntry(row));
    if (hasValidAltAddress(row)) entries.push(buildAltEntry(row));
  }
  for (const row of officerRows) {
    entries.push(buildPrimaryEntry(row));
  }
  return entries;
}

/**
 * Selection-driven collection: builds address blocks only for the parties
 * the user actually checked in the docket Mailer List, in the order they
 * were selected. Each entry is re-fetched from its source model by caseId +
 * identity (never trusts field values sent from the client) so a tampered
 * request can only select real rows on this case, never inject content.
 * @param {number} caseId
 * @param {Array<{source: string, id: string|number}>} selectedMailerParties
 * @returns {Promise<string[]>}
 */
async function buildAddressesForSelection(caseId, selectedMailerParties) {
  const requestedIdsBySource = {};
  for (const party of selectedMailerParties) {
    const source = party?.source;
    const id = party?.id == null ? null : String(party.id);
    if (!id || !MODEL_BY_SOURCE[source]) continue;
    (requestedIdsBySource[source] ??= new Set()).add(id);
  }

  const sources = Object.keys(requestedIdsBySource);
  const rowMapsBySource = {};
  await Promise.all(
    sources.map(async (source) => {
      const rows = await MODEL_BY_SOURCE[source].findAll({
        attributes: QUERY_ATTRIBUTES_BY_SOURCE[source],
        where: { caseId },
        raw: true,
      });
      const map = new Map();
      for (const row of rows) {
        const id = computePartyRecordId(row);
        if (id && requestedIdsBySource[source].has(id)) map.set(id, row);
      }
      rowMapsBySource[source] = map;
    }),
  );

  const entries = [];
  for (const party of selectedMailerParties) {
    const source = party?.source;
    const id = party?.id == null ? null : String(party.id);
    const row = id && rowMapsBySource[source]?.get(id);
    if (!row) continue; // unselected/stale/unknown parties never render
    entries.push(buildPrimaryEntry(row));
    if (source === 'peopledetails' && hasValidAltAddress(row)) {
      entries.push(buildAltEntry(row));
    }
  }
  return entries;
}

/**
 * Builds the ordered mailing-address block collection for a case.
 * When selectedMailerParties is a non-empty array (currently: docket
 * Download with a Mailer List selection), addresses are built only for
 * those exact selected parties, in selection order. Otherwise falls back
 * to the fixed Respondent/Petitioner/Officer collection.
 * Returns [] on any error — callers must treat this as best-effort.
 * @param {number} caseId
 * @param {Array<{source: string, id: string|number}>} [selectedMailerParties]
 * @returns {Promise<string[]>}
 */
export async function buildSelectedPartyAddresses(caseId, selectedMailerParties) {
  try {
    if (Array.isArray(selectedMailerParties) && selectedMailerParties.length > 0) {
      return await buildAddressesForSelection(caseId, selectedMailerParties);
    }
    return await buildDefaultPartyAddresses(caseId);
  } catch {
    return [];
  }
}
