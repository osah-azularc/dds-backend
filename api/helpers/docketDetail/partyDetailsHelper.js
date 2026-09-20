import PeopleDetails from '../../models/PeopleDetails.js';
import MinorDetails from '../../models/MinorDetails.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';

const DEFAULT_ORDER = [['modifiedDate', 'DESC']];

const normalizeString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeId = (value) => (value === undefined || value === null || value === '' ? null : String(value));

const mapPartyRecord = (record, sourceTable) => {
  const row = record?.toJSON ? record.toJSON() : record;
  const firstName = normalizeString(row.firstName);
  const middleName = normalizeString(row.middleName);
  const lastName = normalizeString(row.lastName);
  const typeOfContact = sourceTable === 'minordetails' ? 'Minor/Children' : normalizeString(row.typeOfContact);
  const partyName = [lastName, [firstName, middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return {
    ...(sourceTable !== 'minordetails' && {
      eServices: normalizeString(row.eServices || '0') || '0',
    }),
    ...(sourceTable === 'minordetails' && {
      dobYear: normalizeString(row.dobYear),
    }),
    id: normalizeId(row.peopleId ?? row.contactId ?? row.minorId ?? row.attorneyId ?? row.sno),
    caseId: normalizeId(row.caseId),
    peopleId: normalizeId(row.peopleId),
    contactId: normalizeId(row.contactId ?? row.sno),
    minorId: normalizeId(row.minorId),
    attorneyId: normalizeId(row.attorneyId ?? row.sno),
    sno: normalizeId(row.sno),
    docketCaseId: normalizeId(row.docketCaseId),
    externalUserId: normalizeId(row.externalUserId),
    typeOfContact,
    typeOfContactName: typeOfContact,
    firstName,
    middleName,
    lastName,
    partyName,
    phone: normalizeString(row.phone),
    email: normalizeString(row.email),
    address1: normalizeString(row.address1),
    address2: normalizeString(row.address2),
    city: normalizeString(row.city),
    state: normalizeString(row.state),
    zip: normalizeString(row.zip),
    title: normalizeString(row.title),
    company: normalizeString(row.company),
    fax: normalizeString(row.fax),
    attorneyBar: normalizeString(row.attorneyBar),
    badgeNo: normalizeString(row.badgeNo),
    isGeorgiaState: normalizeString(row.isGeorgiaState || '0') || '0',
    createdDate: row.createdDate ?? null,
    modifiedDate: row.modifiedDate ?? null,
    altAddress1: normalizeString(row.altAddress1),
    altAddress2: normalizeString(row.altAddress2),
    altCity: normalizeString(row.altCity),
    altState: normalizeString(row.altState),
    altZipCode: normalizeString(row.altZipCode),
    isInternationalAddr: normalizeString(row.isInternationalAddr || '0') || '0',
    internationalAddress: normalizeString(row.internationalAddress),
    source: sourceTable,
  };
};

const hasAlternateAddress = (party) => (
  normalizeString(party.altAddress1)
  && normalizeString(party.altCity)
  && normalizeString(party.altState)
  && normalizeString(party.altZipCode)
);

const isPetitionerOrRespondent = (typeOfContact) => {
  const normalized = normalizeString(typeOfContact).toLowerCase();
  return normalized === 'petitioner' || normalized === 'respondent';
};

export async function getPartyDetailsByDocket(docketNo) {
  const resolvedDocketNo = String(docketNo || '').trim();

  const [peopleRows, agencyRows, minorRows, attorneyRows] = await Promise.all([
    PeopleDetails.findAll({ where: { caseId: resolvedDocketNo }, order: DEFAULT_ORDER }),
    AgencyCaseworkerByCase.findAll({ where: { caseId: resolvedDocketNo }, order: DEFAULT_ORDER }),
    MinorDetails.findAll({ where: { caseId: resolvedDocketNo }, order: DEFAULT_ORDER }),
    AttorneyByCase.findAll({ where: { caseId: resolvedDocketNo }, order: DEFAULT_ORDER }),
  ]);

  const peopleDetails = peopleRows.map((row) => mapPartyRecord(row, 'peopledetails'));
  const agencyCaseworkerDetails = agencyRows.map((row) => mapPartyRecord(row, 'agencycaseworkerbycase'));
  const minorDetails = minorRows.map((row) => mapPartyRecord(row, 'minordetails'));
  const attorneyDetails = attorneyRows.map((row) => mapPartyRecord(row, 'attorneybycase'));

  const alternateAddressCount = peopleDetails.filter((party) => (
    isPetitionerOrRespondent(party.typeOfContact) && hasAlternateAddress(party)
  )).length;

  return {
    data: [
      ...peopleDetails,
      ...agencyCaseworkerDetails,
      ...minorDetails,
      ...attorneyDetails,
    ],
    count: alternateAddressCount,
  };
}

// Legacy bulk NOH/Continuance/Disposition all require 1-6 parties, else skip the docket.
const MAX_BULK_PARTY_COUNT = 6;

export async function isEligibleForBulkPartyCount(docketNo) {
  const { data, count } = await getPartyDetailsByDocket(docketNo);
  const nonMinorPartyCount = data.filter((party) => party.typeOfContact !== 'Minor/Children').length;
  const totalCount = count + nonMinorPartyCount;
  return totalCount > 0 && totalCount <= MAX_BULK_PARTY_COUNT;
}