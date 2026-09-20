import MinorDetails from "../../models/MinorDetails.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import AgencyCaseworkerByCase from "../../models/AgencyCaseworkerByCase.js";
import AgencyCaseworkerByCaseMaster from "../../models/admin/agencyCaseworkerByCaseMasterModel.js";
import AttorneyByCase from "../../models/AttorneyByCase.js";
import AttorneyByCaseMaster from "../../models/admin/attorneyByCaseMasterModel.js";
import { insertPartyAddedHistory } from "../../helpers/docketDetail/partyHistoryHelper.js";
import {
  buildAltAddressFromSnakeCase,
  buildPartyData,
  findPublicAccessEServices,
  syncDocketFieldForTable,
} from "./docketPartySharedHelpers.js";

// ─── Create (createPartyDocket) ──────────────────────────────────────────────
// Each handler returns { conflict: true } if a duplicate party already
// exists, otherwise inserts the row, syncs any docket-level field, logs a
// history entry for the exact same data object that was inserted, and
// returns { conflict: false }.

const createMasterRecord = (
  Model,
  partydetails,
  contactType,
  now,
  lastName,
  firstName,
) =>
  Model.findOrCreate({
    where: {
      lastName,
      firstName,
      // address1 is legitimately absent for international-address parties
      // (addressLine1 gets unregistered client-side, so the key is missing
      // from the payload entirely). Sequelize's WHERE builder throws on a
      // literal `undefined` value ("WHERE parameter ... has invalid
      // \"undefined\" value") — coalesce to null so the lookup still runs.
      address1: partydetails.address1 ?? null,
      typeOfContact: contactType,
    },
    defaults: buildPartyData(partydetails, contactType, now),
  });

async function createMinorPartyRecord({
  partydetails,
  contactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const lastName = partydetails.last_name;
  const firstName = partydetails.first_name;

  const existing = await MinorDetails.findOne({
    where: { caseId: docketNumber, lastName, firstName },
    transaction,
  });
  if (existing) return { conflict: true };

  const data = {
    caseId: docketNumber,
    docketCaseId: docketNumber,
    lastName,
    firstName,
    middleName: partydetails.middle_name,
    dobYear: partydetails.dobyear,
    createdDate: now,
    modifiedDate: now,
  };
  await MinorDetails.create(data, { transaction });

  await insertPartyAddedHistory(docketNumber, contactType, data, username, transaction);
  return { conflict: false };
}

async function createPeoplePartyRecord({
  partydetails,
  contactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const lastName = partydetails.last_name;
  const firstName = partydetails.first_name;

  const existing = await PeopleDetails.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
    },
    transaction,
  });
  if (existing) return { conflict: true };

  const eServices = await findPublicAccessEServices(
    partydetails.email,
    transaction,
  );
  const data = {
    caseId: docketNumber,
    docketCaseId: docketNumber,
    ...buildPartyData(partydetails, contactType, now),
    isInternationalAddr: partydetails.is_international_addr || "0",
    internationalAddress: partydetails.international_address || "",
    ...buildAltAddressFromSnakeCase(partydetails, contactType),
    eServices,
  };

  await PeopleDetails.create(data, { transaction });

  await syncDocketFieldForTable(
    "peopledetails",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyAddedHistory(docketNumber, contactType, data, username, transaction);
  return { conflict: false };
}

async function createAgencyPartyRecord({
  partydetails,
  contactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const lastName = partydetails.last_name;
  const firstName = partydetails.first_name;

  await createMasterRecord(
    AgencyCaseworkerByCaseMaster,
    partydetails,
    contactType,
    now,
    lastName,
    firstName,
  );

  const existing = await AgencyCaseworkerByCase.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
    },
    transaction,
  });
  if (existing) return { conflict: true };

  const eServices = await findPublicAccessEServices(
    partydetails.email,
    transaction,
  );
  const data = {
    caseId: docketNumber,
    docketCaseId: docketNumber,
    ...buildPartyData(partydetails, contactType, now),
    isInternationalAddr: partydetails.is_international_addr || "0",
    internationalAddress: partydetails.international_address || "",
    badgeNo: partydetails.badge_no,
    isGeorgiaState: partydetails.is_georgia_state || "0",
    eServices,
  };

  await AgencyCaseworkerByCase.create(data, { transaction });

  await syncDocketFieldForTable(
    "agencycaseworkerbycase",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyAddedHistory(docketNumber, contactType, data, username, transaction);
  return { conflict: false };
}

async function createAttorneyPartyRecord({
  partydetails,
  contactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const lastName = partydetails.last_name;
  const firstName = partydetails.first_name;

  await createMasterRecord(
    AttorneyByCaseMaster,
    partydetails,
    contactType,
    now,
    lastName,
    firstName,
  );

  const existing = await AttorneyByCase.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
    },
    transaction,
  });
  if (existing) return { conflict: true };

  const eServices = await findPublicAccessEServices(
    partydetails.email,
    transaction,
  );
  const data = {
    caseId: docketNumber,
    docketCaseId: docketNumber,
    ...buildPartyData(partydetails, contactType, now),
    attorneyBar: partydetails.attorney,
    isInternationalAddr: partydetails.is_international_addr || "0",
    internationalAddress: partydetails.international_address || "",
    eServices,
  };

  await AttorneyByCase.create(data, { transaction });

  await syncDocketFieldForTable(
    "attorneybycase",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyAddedHistory(docketNumber, contactType, data, username, transaction);
  return { conflict: false };
}

export const CREATE_PARTY_HANDLERS = {
  minordetails: createMinorPartyRecord,
  peopledetails: createPeoplePartyRecord,
  agencycaseworkerbycase: createAgencyPartyRecord,
  attorneybycase: createAttorneyPartyRecord,
};
