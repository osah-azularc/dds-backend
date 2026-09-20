import { Op } from "sequelize";
import MinorDetails from "../../models/MinorDetails.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import AgencyCaseworkerByCase from "../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../models/AttorneyByCase.js";
import { insertPartyUpdatedHistory } from "../../helpers/docketDetail/partyHistoryHelper.js";
import {
  buildAltAddressFromCamelCase,
  buildPartyUpdateData,
  syncDocketFieldForTable,
} from "./docketPartySharedHelpers.js";

// ─── Update (updatePartyDocket, same-table branch) ──────────────────────────
// Each handler returns { status: "conflict" | "not_found" | "updated" }.
// The same updateData object is passed to both the DB update and the history
// helper, so whatever actually got written is exactly what gets logged.

async function updateMinorPartyRecord({
  editpartydetails,
  contactType,
  previousContactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const minorId = editpartydetails.minorId || editpartydetails.id;
  const { lastName, firstName } = editpartydetails;
  const previousParty = await MinorDetails.findOne({
    where: { minorId },
    transaction,
    raw: true,
  });

  const duplicate = await MinorDetails.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      minorId: { [Op.ne]: minorId },
    },
    transaction,
  });
  if (duplicate) return { status: "conflict" };

  const updateData = {
    lastName,
    firstName,
    middleName: editpartydetails.middleName,
    dobYear: editpartydetails.dobyear,
    address1: editpartydetails.addressLine1,
    address2: editpartydetails.addressLine2,
    city: editpartydetails.city,
    state: editpartydetails.state,
    zip: editpartydetails.zipCode,
    phone: editpartydetails.phone,
    email: editpartydetails.email,
    modifiedDate: now,
  };
  const [updatedRows] = await MinorDetails.update(updateData, {
    where: { minorId },
    transaction,
  });
  if (!updatedRows) return { status: "not_found" };

  await insertPartyUpdatedHistory(
    docketNumber,
    contactType,
    previousParty,
    updateData,
    username,
    transaction,
    previousContactType,
  );
  return { status: "updated" };
}

async function updatePeoplePartyRecord({
  editpartydetails,
  contactType,
  previousContactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const peopleId = editpartydetails.peopleId || editpartydetails.id;
  const { lastName, firstName } = editpartydetails;
  const previousParty = await PeopleDetails.findOne({
    where: { peopleId },
    transaction,
    raw: true,
  });

  const duplicate = await PeopleDetails.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
      peopleId: { [Op.ne]: peopleId },
    },
    transaction,
  });
  if (duplicate) return { status: "conflict" };

  const updateData = {
    ...buildPartyUpdateData(editpartydetails, contactType, now),
    ...buildAltAddressFromCamelCase(editpartydetails, contactType),
  };
  const [updatedRows] = await PeopleDetails.update(updateData, {
    where: { peopleId },
    transaction,
  });
  if (!updatedRows) return { status: "not_found" };

  await syncDocketFieldForTable(
    "peopledetails",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyUpdatedHistory(
    docketNumber,
    contactType,
    previousParty,
    updateData,
    username,
    transaction,
    previousContactType,
  );
  return { status: "updated" };
}

async function updateAgencyPartyRecord({
  editpartydetails,
  contactType,
  previousContactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const sno = editpartydetails.sno || editpartydetails.id;
  const { lastName, firstName } = editpartydetails;
  const previousParty = await AgencyCaseworkerByCase.findOne({
    where: { sno },
    transaction,
    raw: true,
  });

  const duplicate = await AgencyCaseworkerByCase.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
      sno: { [Op.ne]: sno },
    },
    transaction,
  });
  if (duplicate) return { status: "conflict" };

  const updateData = {
    ...buildPartyUpdateData(editpartydetails, contactType, now),
    badgeNo: editpartydetails.badge_no || editpartydetails.badgeNo || "",
    isGeorgiaState:
      editpartydetails.is_georgia_state ||
      editpartydetails.isGeorgiaState ||
      "0",
  };
  const [updatedRows] = await AgencyCaseworkerByCase.update(updateData, {
    where: { sno },
    transaction,
  });
  if (!updatedRows) return { status: "not_found" };

  await syncDocketFieldForTable(
    "agencycaseworkerbycase",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyUpdatedHistory(
    docketNumber,
    contactType,
    previousParty,
    updateData,
    username,
    transaction,
    previousContactType,
  );
  return { status: "updated" };
}

async function updateAttorneyPartyRecord({
  editpartydetails,
  contactType,
  previousContactType,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const sno = editpartydetails.sno || editpartydetails.id;
  const { lastName, firstName } = editpartydetails;
  const previousParty = await AttorneyByCase.findOne({
    where: { sno },
    transaction,
    raw: true,
  });

  const duplicate = await AttorneyByCase.findOne({
    where: {
      caseId: docketNumber,
      lastName,
      firstName,
      typeOfContact: contactType,
      sno: { [Op.ne]: sno },
    },
    transaction,
  });
  if (duplicate) return { status: "conflict" };

  const updateData = {
    ...buildPartyUpdateData(editpartydetails, contactType, now),
    attorneyBar:
      editpartydetails.attorney || editpartydetails.attorneyBar || "",
  };
  const [updatedRows] = await AttorneyByCase.update(updateData, {
    where: { sno },
    transaction,
  });
  if (!updatedRows) return { status: "not_found" };

  await syncDocketFieldForTable(
    "attorneybycase",
    contactType,
    lastName,
    firstName,
    docketNumber,
    transaction,
  );
  await insertPartyUpdatedHistory(
    docketNumber,
    contactType,
    previousParty,
    updateData,
    username,
    transaction,
    previousContactType,
  );
  return { status: "updated" };
}

export const UPDATE_PARTY_HANDLERS = {
  minordetails: updateMinorPartyRecord,
  peopledetails: updatePeoplePartyRecord,
  agencycaseworkerbycase: updateAgencyPartyRecord,
  attorneybycase: updateAttorneyPartyRecord,
};
