import Form1Parties from '../models/Form1Parties.js';
import Form1Docket from '../models/Form1Docket.js';
import AttorneyByCaseMaster from '../models/admin/attorneyByCaseMasterModel.js';
import { DDS_AGENCY_PLATFORM_ID } from './ddsForm1Service.js';
import { addHistoryEntry } from './ddsForm1HistoryService.js';
import {
  buildPartyAddedMessage,
  buildPartyUpdatedMessage,
  buildPartyDeletedMessage,
} from '../helpers/ddsHistoryMessageBuilder.js';
import { logger } from '../../config/winstonLogger.js';

// A history-logging failure should never fail the party action it's describing.
async function logHistorySafely(form1Id, message, modifiedBy) {
  try {
    await addHistoryEntry(form1Id, message, modifiedBy);
  } catch (error) {
    logger.error('Error logging ddshistory entry (dds-form1 party):', error);
  }
}

const toNullable = (value) => (value === undefined || value === '' ? null : value);

/**
 * Maps the Add/Edit Party modal's fields onto Form1Parties columns. Ports the two
 * contact-type branches of DdsForm1Controller::addPartyDDSDetailsAction()/
 * editpartydetailsAction() -- Petitioner gets the "Add Additional Address" alt-address
 * columns, Petitioner Attorney gets Attorney Bar #/Company/"new contact" instead. The
 * inapplicable side is explicitly nulled so editing a party's contact type doesn't leave
 * stale data behind (legacy handles a contact-type change by deleting the old type's row
 * outright across separate tables; this single `form1_parties` table just clears columns).
 */
function buildPartyFields(partydetails) {
  const {
    contactType,
    lastName,
    firstName,
    middleName,
    attorneyBar,
    company,
    isNewContact,
    isInternationalAddr,
    internationalAddress,
    address1,
    address2,
    city,
    state,
    zip,
    phone,
    email,
    fax,
    altAddress1,
    altAddress2,
    altCity,
    altState,
    altZipCode,
  } = partydetails;

  const isPetitioner = contactType === 'Petitioner';

  return {
    typeOfContact: contactType,
    lastName,
    firstName,
    middleName: toNullable(middleName),
    address1: toNullable(address1),
    address2: toNullable(address2),
    city: toNullable(city),
    state: toNullable(state),
    zip: toNullable(zip),
    phone: toNullable(phone),
    email: toNullable(email),
    fax: toNullable(fax),
    isInternationalAddr,
    internationalAddress: isInternationalAddr === '1' ? toNullable(internationalAddress) : null,
    altAddress1: isPetitioner ? toNullable(altAddress1) : null,
    altAddress2: isPetitioner ? toNullable(altAddress2) : null,
    altCity: isPetitioner ? toNullable(altCity) : null,
    altState: isPetitioner ? toNullable(altState) : null,
    altZipCode: isPetitioner ? toNullable(altZipCode) : null,
    attorneyBar: isPetitioner ? null : toNullable(attorneyBar),
    company: isPetitioner ? null : toNullable(company),
    isNewContact: isPetitioner ? null : isNewContact || '0',
  };
}

// Petitioner updates form1_docket.casename, Petitioner Attorney updates
// form1_docket.attorneyforpetitioner -- both "Lastname, Firstname", matching
// addPartyDDSDetailsAction()'s post-insert docket update. Petitioner's License Number
// field is the docket's own Agency Reference Number (legacy sends it to a separate
// updatelicensenumberAction() call; folded in here as one update instead).
async function syncDocketDisplayFields(form1Id, partydetails) {
  const displayName = [partydetails.lastName, partydetails.firstName].filter(Boolean).join(', ');

  if (partydetails.contactType === 'Petitioner') {
    const docketUpdates = { caseName: displayName };
    if (partydetails.licenseNumber) docketUpdates.agencyRefNumber = partydetails.licenseNumber;
    await Form1Docket.update(docketUpdates, { where: { form1Id } });
  } else {
    await Form1Docket.update({ attorneyForPetitioner: displayName }, { where: { form1Id } });
  }
}

/**
 * Adds a party to a Form1 docket (Add Party modal's Save).
 * Ports DdsForm1Controller::addPartyDDSDetailsAction()'s Petitioner/Petitioner Attorney
 * branches. Skips legacy's duplicate-docket similarity check (Petitioner-only) and its
 * exact-duplicate-name guard (Petitioner Attorney-only) -- neither is surfaced in this
 * screen's UI yet.
 */
export const addParty = async (form1Id, partydetails, userId, modifiedByName) => {
  const now = new Date();

  await Form1Parties.create({
    ...buildPartyFields(partydetails),
    form1Id,
    agencyId: DDS_AGENCY_PLATFORM_ID,
    createdBy: userId,
    createdDate: now,
    modifiedBy: userId,
    modifiedDate: now,
  });

  await syncDocketDisplayFields(form1Id, partydetails);
  await logHistorySafely(
    form1Id,
    buildPartyAddedMessage(partydetails, partydetails.licenseNumber),
    modifiedByName,
  );
};

/**
 * Edits an existing party on a Form1 docket. Ports the in-place-update branch of
 * editpartydetailsAction() (partyId + contact type unchanged) -- always updates in place
 * here since form1_parties is one table, rather than legacy's delete-old-row-on-type-change
 * dance across separate tables.
 */
export const editParty = async (form1Id, partyId, partydetails, userId, modifiedByName) => {
  const now = new Date();

  await Form1Parties.update(
    { ...buildPartyFields(partydetails), modifiedBy: userId, modifiedDate: now },
    { where: { partyId, form1Id } },
  );

  await syncDocketDisplayFields(form1Id, partydetails);
  await logHistorySafely(
    form1Id,
    buildPartyUpdatedMessage(partydetails, partydetails.licenseNumber),
    modifiedByName,
  );
};

/**
 * Last Name autocomplete suggestions for the Petitioner Attorney branch. Ports
 * DdsForm1Controller::autopopulateddsAction() -> OsahDbFunctions::getAutocomplectDDSData(),
 * which only returns results for 'Petitioner Attorney' (Petitioner has no autocomplete in
 * legacy). Queries attorneybycase_master (a cross-case dedup table, separate from
 * form1_parties) and dedupes by address1+first+last name in JS, since Sequelize's
 * query builder has no clean GROUP BY-for-dedup equivalent to legacy's raw SQL.
 */
export const autopopulateParty = async (contactType) => {
  if (contactType !== 'Petitioner Attorney') return [];

  const rows = await AttorneyByCaseMaster.findAll({
    where: { typeOfContact: 'Petitioner Attorney', isActive: '1' },
    order: [['lastName', 'ASC']],
  });

  const seen = new Set();
  const suggestions = [];
  rows.forEach((row) => {
    const key = `${row.address1}|${row.firstName}|${row.lastName}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      id: `${row.sno}-B`,
      name: [row.lastName, row.firstName, row.address1, row.address2].filter(Boolean).join(' '),
      lastName: row.lastName,
    });
  });

  return suggestions;
};

/**
 * Full attorney record for a selected autocomplete suggestion, to autofill the rest of the
 * form. Ports DdsForm1Controller::getddsinformationAction() -> getddspartyinformationData():
 * strips the suggestion id's "-B" suffix back to attorneybycase_master.sno.
 */
export const getPartyAutofillDetails = async (partyId) => {
  const sno = Number.parseInt(partyId.replace(/-B$/, ''), 10);
  const row = await AttorneyByCaseMaster.findOne({ where: { sno } });
  if (!row) return null;

  return {
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    company: row.company,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    email: row.email,
    fax: row.fax,
    phone: row.phone,
    attorneyBar: row.attorneyBar,
  };
};

/**
 * Every party on a Form1 docket, for the Party Information section. Ports
 * DdsForm1Controller::getPartyDetailsAction() (dds-form1/get-party-details) -- a separate
 * endpoint from searchDocketInfo() in legacy too, not bundled into the main docket-info
 * response.
 */
export const getPartyList = async (form1Id) => {
  const rows = await Form1Parties.findAll({ where: { form1Id }, order: [['modifiedDate', 'DESC']] });
  return rows.map((row) => row.toJSON());
};

/**
 * Deletes a party from a Form1 docket. Ports the Petitioner/Petitioner Attorney branches of
 * DdsForm1Controller::deletepartyAction() -- legacy dispatches by typeofcontact to a
 * different physical table per branch, but every branch's actual DELETE targets
 * form1_parties for DDS's Form1 flow, so this just deletes the one row + applies the same
 * per-type docket-display-field update:
 *  - Petitioner: form1_docket.casename is reset to another remaining Petitioner's name, or
 *    '' if none are left (legacy also falls back to a remaining Respondent, which doesn't
 *    apply here -- DDS's Add Party modal only offers Petitioner/Petitioner Attorney).
 *  - Petitioner Attorney: form1_docket.attorneyforpetitioner is unconditionally cleared to
 *    '' (legacy does the same -- it doesn't look for another remaining attorney).
 * Skips legacy's external_documents/publicaccess_users delete-guard check -- DDS's Form1
 * flow has no such public-access integration built yet.
 */
export const deleteParty = async (form1Id, partyId, contactType, modifiedByName) => {
  const partyRow = await Form1Parties.findOne({ where: { partyId, form1Id } });
  await Form1Parties.destroy({ where: { partyId, form1Id } });

  if (contactType === 'Petitioner') {
    const remaining = await Form1Parties.findOne({
      where: { form1Id, typeOfContact: 'Petitioner' },
      order: [['modifiedDate', 'DESC']],
    });
    const caseName = remaining ? [remaining.lastName, remaining.firstName].filter(Boolean).join(', ') : '';
    await Form1Docket.update({ caseName }, { where: { form1Id } });
  } else {
    await Form1Docket.update({ attorneyForPetitioner: '' }, { where: { form1Id } });
  }

  if (partyRow) {
    await logHistorySafely(form1Id, buildPartyDeletedMessage(partyRow.toJSON()), modifiedByName);
  }
};

export default { addParty, editParty, autopopulateParty, getPartyAutofillDetails, getPartyList, deleteParty };
