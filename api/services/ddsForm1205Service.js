import Form1Docket from '../models/Form1Docket.js';
import Form1Parties from '../models/Form1Parties.js';
import Form1Dds1205Offence from '../models/Form1Dds1205Offence.js';
import AttorneyByCaseMaster from '../models/admin/attorneyByCaseMasterModel.js';
import { DDS_AGENCY_PLATFORM_ID } from './ddsForm1Service.js';
import { addHistoryEntry } from './ddsForm1HistoryService.js';
import { buildAttorneyRespondentAddedMessage } from '../helpers/ddsHistoryMessageBuilder.js';
import { logger } from '../../config/winstonLogger.js';

// A history-logging failure should never fail the action it's describing.
async function logHistorySafely(form1Id, message, modifiedBy) {
  try {
    await addHistoryEntry(form1Id, message, modifiedBy);
  } catch (error) {
    logger.error('Error logging ddshistory entry (dds-form1205):', error);
  }
}

const toNullable = (value) => (value === undefined || value === '' ? null : value);

/**
 * Marks a docket as sent to DPS. Ports DdsForm1Controller::updateddstodpsAction() exactly --
 * legacy's own action only ever reads `condition` (form1Id) from its payload and hardcodes
 * `refagency = 'DPS'`; the rest of the legacy request body (agencey/casetype/county/countyid/
 * Address1) is dead input, never read, so this endpoint's contract only takes form1Id.
 */
export const updateDdsToDps = async (form1Id) => {
  await Form1Docket.update({ refAgency: 'DPS' }, { where: { form1Id } });
};

// Officer Information -> form1_parties column mapping. `precinct`/`address` land on
// address1/address2 -- legacy's own Precinct/Address inputs are ng-model="address1"/"address2"
// (form1-1205form.phtml:314,341), not distinct columns.
function buildOfficerFields(officerDetails) {
  return {
    lastName: officerDetails.lastName,
    firstName: officerDetails.firstName,
    middleName: toNullable(officerDetails.middleName),
    address1: toNullable(officerDetails.precinct),
    address2: toNullable(officerDetails.address),
    city: toNullable(officerDetails.city),
    state: toNullable(officerDetails.state),
    zip: toNullable(officerDetails.zip),
    email: toNullable(officerDetails.email),
    fax: toNullable(officerDetails.fax),
    phone: toNullable(officerDetails.phone),
    isGeorgiaState: officerDetails.isGeorgiaState,
    badgeNo: toNullable(officerDetails.badgeNo),
  };
}

// Every success branch below also syncs these two form1_docket columns. Legacy does the same
// on its first-submission branches, but its resubmission branch (telv_o_five already '1')
// builds this same update and then immediately overwrites the $data variable with just
// {form1_id} before the query runs, so that update silently no-ops in production
// (DdsForm1Controller.php:654-661). Fixed here to actually apply on every branch, since that
// drop was clearly unintentional (the surrounding code/comment both describe writing these two
// columns), not a deliberate business rule.
async function syncDocketAfterOfficerSave(form1Id, officerDetails) {
  const displayName = [officerDetails.lastName, officerDetails.firstName].filter(Boolean).join(', ');
  await Form1Docket.update(
    { stateRepresentative: displayName, isFileScanned: '1' },
    { where: { form1Id } },
  );
}

/**
 * Saves the Officer Information section (Form 1205 screen). Loosely ports the 'Officer' branch
 * of DdsForm1Controller::addPartyDetailsAction() (lines 528-666), but with a reliable
 * upsert key: legacy's own update-vs-insert logic there is keyed off `form1_parties.sno`, which
 * turns out to be a plain nullable `int` column with no default and no auto-increment in the
 * real schema (confirmed via `SHOW COLUMNS`) -- legacy's own insert never sets it either, so
 * that whole distinctness mechanism silently never worked, and every save just inserted a new
 * duplicate party row. This uses `party_id` (the table's actual auto-increment primary key)
 * instead: update the same row the frontend already knows about (from a prior save or from
 * search1205Info()) when `officerDetails.partyId` is given, otherwise fall back to this
 * docket's existing Officer party (there's only ever meant to be one), else insert new.
 */
export const addOfficerPartyDetails = async (form1Id, officerDetails) => {
  const partyFields = buildOfficerFields(officerDetails);

  const existing = officerDetails.partyId
    ? await Form1Parties.findOne({ where: { partyId: officerDetails.partyId, form1Id } })
    : await Form1Parties.findOne({
        where: { form1Id, typeOfContact: 'Officer' },
        order: [['partyId', 'DESC']],
      });

  let result;
  if (existing) {
    await existing.update(partyFields);
    result = { partyId: existing.partyId };
  } else {
    const created = await Form1Parties.create({
      ...partyFields,
      typeOfContact: 'Officer',
      form1Id,
      agencyId: DDS_AGENCY_PLATFORM_ID,
      createdDate: new Date(),
    });
    result = { partyId: created.partyId };
  }

  await syncDocketAfterOfficerSave(form1Id, officerDetails);
  return result;
};

// Incident Information -> form1_dds_1205_offence column mapping.
function buildIncidentFields(incidentDetails) {
  const height =
    incidentDetails.feet || incidentDetails.inches
      ? `${incidentDetails.feet || ''}'${incidentDetails.inches || ''}`
      : null;

  return {
    officerId: incidentDetails.officerId ?? null,
    citiation: toNullable(incidentDetails.citation),
    countyOfOccurences: toNullable(incidentDetails.countyOccur),
    incidentDate: toNullable(incidentDetails.incidentDate),
    incidentTime: toNullable(incidentDetails.incidentTime),
    officerBadgeNumber: toNullable(incidentDetails.officerBadgeNumber),
    commercialVehicle: incidentDetails.commercialVehicle,
    hazourdousVehicle: incidentDetails.hazardousVehicle,
    stateOfIssue: toNullable(incidentDetails.stateOfIssue),
    licenseClassId: toNullable(incidentDetails.licenseClass),
    dob: toNullable(incidentDetails.dob),
    restrictions: toNullable(incidentDetails.restrictions),
    gender: toNullable(incidentDetails.gender),
    height,
    weight: toNullable(incidentDetails.weight),
    driverRequest: toNullable(incidentDetails.driverRequest),
  };
}

/**
 * Saves the Incident Information section (Form 1205 screen) -- the second of the two
 * addPartyDetails calls legacy's own frontend makes on Save/Submit (this one with
 * `contactType: 'form1205'`), ports the 'Form1205' branch of
 * DdsForm1Controller::addPartyDetailsAction() (lines 668-833):
 *  - form1_docket: refagency='DPS', county=County of Occurrence, status (pending/submitted
 *    depending on Save vs Submit -- matches legacy's own buttonStatus-driven $finalStatus),
 *    is_file_scanned='1', telv_o_five='1'. Legacy also blanks docketnumber unconditionally;
 *    skipped here since nothing in this port ever sets it in the first place.
 *  - form1_dds_1205_offence: updated in place (this row always exists already -- created
 *    alongside the docket by addDocket() in ddsForm1Service.js). `officerId` is the Officer
 *    party's own party_id (see addOfficerPartyDetails() above), replacing legacy's own
 *    `officerrid`/`sno` linkage, which relied on the same non-functional `sno` column.
 *  - form1_docket.dateReceivedByOSAH is stamped with today's date the first time this ever
 *    runs for a docket (matches legacy's own empty-check before writing it).
 */
export const saveIncidentInformation = async (form1Id, incidentDetails, finalStatus) => {
  const now = new Date();

  await Form1Docket.update(
    {
      refAgency: 'DPS',
      county: toNullable(incidentDetails.countyOccur),
      status: finalStatus,
      isFileScanned: '1',
      telvOFive: '1',
    },
    { where: { form1Id } },
  );

  const incidentFields = buildIncidentFields(incidentDetails);
  const offenceRow = await Form1Dds1205Offence.findOne({ where: { form1Id } });
  if (offenceRow) {
    await offenceRow.update({ ...incidentFields, modifiedDate: now });
  } else {
    await Form1Dds1205Offence.create({ ...incidentFields, form1Id, modifiedDate: now, dateCreated: now });
  }

  const docket = await Form1Docket.findOne({ where: { form1Id } });
  if (!docket.dateReceivedByOSAH) {
    await docket.update({ dateReceivedByOSAH: now });
  }
};

const RESPONDENT_ATTORNEY_FIRST_NAME = 'DEE';
const RESPONDENT_ATTORNEY_LAST_NAME = 'BROPHY';

/**
 * Attaches DDS's standard "DEE BROPHY" Respondent Attorney to the docket. Ports
 * DdsForm1Controller::addattorneyrespondentAction() -- a fixed, agency-supplied attorney
 * record (attorneybycase_master), not agency-entered data; copied into a new form1_parties
 * row only once per docket (no-ops if that party already exists).
 */
export const addAttorneyRespondent = async (form1Id, modifiedByName) => {
  const existing = await Form1Parties.findOne({
    where: {
      form1Id,
      typeOfContact: 'Respondent Attorney',
      firstName: RESPONDENT_ATTORNEY_FIRST_NAME,
      lastName: RESPONDENT_ATTORNEY_LAST_NAME,
    },
  });
  if (existing) return { added: false };

  const template = await AttorneyByCaseMaster.findOne({
    where: {
      typeOfContact: 'Respondent Attorney',
      firstName: RESPONDENT_ATTORNEY_FIRST_NAME,
      lastName: RESPONDENT_ATTORNEY_LAST_NAME,
    },
  });
  if (!template) return { added: false };

  const now = new Date();
  const attorneyFields = {
    typeOfContact: 'Respondent Attorney',
    lastName: template.lastName,
    firstName: template.firstName,
    middleName: template.middleName,
    title: template.title,
    georgiaBarNo: template.attorneyBar,
    company: template.company,
    address1: template.address1,
    address2: template.address2,
    city: template.city,
    state: template.state,
    zip: template.zip,
    email: template.email,
    phone: template.phone,
    fax: template.fax,
  };

  await Form1Parties.create({
    ...attorneyFields,
    form1Id,
    agencyId: DDS_AGENCY_PLATFORM_ID,
    createdDate: now,
    modifiedDate: now,
  });

  await logHistorySafely(form1Id, buildAttorneyRespondentAddedMessage(attorneyFields), modifiedByName);
  return { added: true };
};

/**
 * Loads the docket's Officer party, merged with its form1_dds_1205_offence row. Ports
 * DdsForm1Controller::search1205infoAction()'s form1_parties branch -- the generic "any table"
 * branch and `condition.sno`/`officerrid` are both unreachable/unused in that action for this
 * table (see the legacy source), so this only implements the one query path DDS's own frontend
 * actually calls (tableName always 'form1_parties'). Ordered by `party_id` (the real PK), not
 * legacy's own `sno` -- see addOfficerPartyDetails() for why that column can't be relied on.
 */
export const search1205Info = async (form1Id) => {
  const officer = await Form1Parties.findOne({
    where: { form1Id, typeOfContact: 'Officer' },
    order: [['partyId', 'DESC']],
  });
  if (!officer) return null;

  const offence = await Form1Dds1205Offence.findOne({ where: { form1Id } });
  return { ...officer.toJSON(), ...(offence ? offence.toJSON() : {}) };
};

export default {
  updateDdsToDps,
  addOfficerPartyDetails,
  saveIncidentInformation,
  addAttorneyRespondent,
  search1205Info,
};
