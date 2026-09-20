import MinorDetails from "../../models/MinorDetails.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import AgencyCaseworkerByCase from "../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../models/AttorneyByCase.js";
import Docket from "../../models/Docket.js";
import { insertPartyUpdatedHistory } from "../../helpers/docketDetail/partyHistoryHelper.js";
import {
  PRIMARY_PARTY_TYPES,
  buildAltAddressFromCamelCase,
  buildPartyUpdateData,
  findPublicAccessEServices,
  formatPartyName,
  syncDocketFieldForTable,
  updateCaseName,
} from "./docketPartySharedHelpers.js";

// ─── Update (updatePartyDocket, contact-type crosses into a different table) ─
// Mirrors the legacy PHP editpartydetails "type changed -> INSERT into the
// new table, then remove the old one" behavior.

const fetchPreviousPartyRow = (tableName, editpartydetails, transaction) => {
  if (tableName === "minordetails") {
    return MinorDetails.findOne({
      where: { minorId: editpartydetails.minorId || editpartydetails.id },
      transaction,
      raw: true,
    });
  }
  if (tableName === "peopledetails") {
    return PeopleDetails.findOne({
      where: { peopleId: editpartydetails.peopleId || editpartydetails.id },
      transaction,
      raw: true,
    });
  }
  if (tableName === "agencycaseworkerbycase") {
    return AgencyCaseworkerByCase.findOne({
      where: { sno: editpartydetails.sno || editpartydetails.id },
      transaction,
      raw: true,
    });
  }
  if (tableName === "attorneybycase") {
    return AttorneyByCase.findOne({
      where: { sno: editpartydetails.sno || editpartydetails.id },
      transaction,
      raw: true,
    });
  }
  return Promise.resolve(null);
};

// Mirrors the duplicate check each CREATE_PARTY_HANDLERS entry runs
// (docketPartyCreateHandlers.js) before inserting: the party is moving into a
// table it doesn't currently occupy, so a duplicate here means some other
// existing row on this docket already matches by name (and contact type,
// where that table distinguishes multiple contact types) — no self-exclusion
// needed since the record can't already be a row in the *target* table.
const checkDuplicateInTargetTable = (
  tableName,
  editpartydetails,
  contactType,
  docketNumber,
  transaction,
) => {
  const { lastName, firstName } = editpartydetails;
  if (tableName === "minordetails") {
    return MinorDetails.findOne({
      where: { caseId: docketNumber, lastName, firstName },
      transaction,
    });
  }
  if (tableName === "peopledetails") {
    return PeopleDetails.findOne({
      where: {
        caseId: docketNumber,
        lastName,
        firstName,
        typeOfContact: contactType,
      },
      transaction,
    });
  }
  if (tableName === "agencycaseworkerbycase") {
    return AgencyCaseworkerByCase.findOne({
      where: {
        caseId: docketNumber,
        lastName,
        firstName,
        typeOfContact: contactType,
      },
      transaction,
    });
  }
  if (tableName === "attorneybycase") {
    return AttorneyByCase.findOne({
      where: {
        caseId: docketNumber,
        lastName,
        firstName,
        typeOfContact: contactType,
      },
      transaction,
    });
  }
  return Promise.resolve(null);
};

// Builds the exact fields written to the target table and inserts them,
// returning that same plain object so the caller can log history from it
// too — mirroring the create handlers' pattern (docketPartyCreateHandlers.js)
// where the history entry is always the literal data just inserted, never a
// separately-derived object. That keeps the history dump from ever showing a
// field the target table doesn't actually have (e.g. minordetails has no
// phone/fax/email columns, but editpartydetails can still be carrying stale
// values for those from whatever contact type the form was previously on).
const insertIntoPartyTable = async (
  tableName,
  editpartydetails,
  contactType,
  docketNumber,
  now,
  transaction,
) => {
  if (tableName === "minordetails") {
    const data = {
      caseId: docketNumber,
      docketCaseId: docketNumber,
      lastName: editpartydetails.lastName,
      firstName: editpartydetails.firstName,
      middleName: editpartydetails.middleName,
      dobYear: editpartydetails.dobyear,
      createdDate: now,
      modifiedDate: now,
    };
    await MinorDetails.create(data, { transaction });
    return data;
  }

  const eServices = await findPublicAccessEServices(
    editpartydetails.email,
    transaction,
  );

  if (tableName === "peopledetails") {
    const data = {
      caseId: docketNumber,
      docketCaseId: docketNumber,
      ...buildPartyUpdateData(editpartydetails, contactType, now),
      ...buildAltAddressFromCamelCase(editpartydetails, contactType),
      createdDate: now,
      eServices,
    };
    await PeopleDetails.create(data, { transaction });
    return data;
  }

  if (tableName === "agencycaseworkerbycase") {
    const data = {
      caseId: docketNumber,
      docketCaseId: docketNumber,
      ...buildPartyUpdateData(editpartydetails, contactType, now),
      createdDate: now,
      badgeNo: editpartydetails.badge_no || editpartydetails.badgeNo || "",
      isGeorgiaState:
        editpartydetails.is_georgia_state ||
        editpartydetails.isGeorgiaState ||
        "0",
      eServices,
    };
    await AgencyCaseworkerByCase.create(data, { transaction });
    return data;
  }

  if (tableName === "attorneybycase") {
    const data = {
      caseId: docketNumber,
      docketCaseId: docketNumber,
      ...buildPartyUpdateData(editpartydetails, contactType, now),
      createdDate: now,
      attorneyBar:
        editpartydetails.attorney || editpartydetails.attorneyBar || "",
      eServices,
    };
    await AttorneyByCase.create(data, { transaction });
    return data;
  }

  return null;
};

// Removes the party's row from the table its *previous* contact type
// belonged to, and cleans up whichever docket field that row was populating —
// mirroring deletePartyDocket's per-table cleanup.
const removeFromPreviousPartyTable = async (
  previousTableName,
  previousContactType,
  editpartydetails,
  docketNumber,
  transaction,
) => {
  if (previousTableName === "minordetails") {
    await MinorDetails.destroy({
      where: { minorId: editpartydetails.minorId || editpartydetails.id },
      transaction,
    });
    return;
  }

  if (previousTableName === "peopledetails") {
    const peopleId = editpartydetails.peopleId || editpartydetails.id;
    if (PRIMARY_PARTY_TYPES.includes(previousContactType)) {
      await updateCaseName(
        peopleId,
        docketNumber,
        previousContactType,
        transaction,
      );
    }
    await PeopleDetails.destroy({ where: { peopleId }, transaction });
    return;
  }

  if (previousTableName === "agencycaseworkerbycase") {
    const sno = editpartydetails.sno || editpartydetails.id;
    await AgencyCaseworkerByCase.destroy({ where: { sno }, transaction });

    const last = await AgencyCaseworkerByCase.findOne({
      where: { caseId: docketNumber },
      order: [["sno", "DESC"]],
      transaction,
    });
    await Docket.update(
      { stateRepresentative: formatPartyName(last) },
      { where: { caseId: docketNumber }, transaction },
    );
    return;
  }

  if (previousTableName === "attorneybycase") {
    const sno = editpartydetails.sno || editpartydetails.id;
    await AttorneyByCase.destroy({ where: { sno }, transaction });

    if ((previousContactType || "").toLowerCase() === "petitioner attorney") {
      await Docket.update(
        { attorneyForPetitioner: "" },
        { where: { caseId: docketNumber }, transaction },
      );
    }
  }
};

export async function movePartyAcrossTables({
  editpartydetails,
  contactType,
  previousContactType,
  tableName,
  previousTableName,
  docketNumber,
  now,
  username,
  transaction,
}) {
  const duplicate = await checkDuplicateInTargetTable(
    tableName,
    editpartydetails,
    contactType,
    docketNumber,
    transaction,
  );
  if (duplicate) return { status: "conflict" };

  const previousParty = await fetchPreviousPartyRow(
    previousTableName,
    editpartydetails,
    transaction,
  );

  const newData = await insertIntoPartyTable(
    tableName,
    editpartydetails,
    contactType,
    docketNumber,
    now,
    transaction,
  );
  if (!newData) return { status: "unsupported" };

  await syncDocketFieldForTable(
    tableName,
    contactType,
    editpartydetails.lastName,
    editpartydetails.firstName,
    docketNumber,
    transaction,
  );
  await removeFromPreviousPartyTable(
    previousTableName,
    previousContactType,
    editpartydetails,
    docketNumber,
    transaction,
  );

  await insertPartyUpdatedHistory(
    docketNumber,
    contactType,
    previousParty,
    newData,
    username,
    transaction,
    previousContactType,
  );

  return { status: "moved" };
}
