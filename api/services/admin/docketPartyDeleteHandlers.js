import MinorDetails from "../../models/MinorDetails.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import AttorneyByCase from "../../models/AttorneyByCase.js";
import AgencyCaseworkerByCase from "../../models/AgencyCaseworkerByCase.js";
import Docket from "../../models/Docket.js";
import { insertPartyDeletedHistory } from "../../helpers/docketDetail/partyHistoryHelper.js";
import { formatPartyName, updateCaseName } from "./docketPartySharedHelpers.js";

// ─── Delete (deletePartyDocket) ──────────────────────────────────────────────
// Each handler fetches the row before destroying it so the "Party has been
// Deleted:" history entry can dump the exact fields that existed at the time
// of deletion — there's nothing left to read from the table afterward.

async function deleteMinorPartyRecord({
  typeofcontact,
  docketnum,
  param,
  username,
  transaction,
}) {
  const minorId = param.minor_id || param.minorId;
  const party = await MinorDetails.findOne({
    where: { minorId },
    transaction,
    raw: true,
  });
  await MinorDetails.destroy({ where: { minorId }, transaction });
  await insertPartyDeletedHistory(
    docketnum,
    typeofcontact,
    party,
    username,
    transaction,
  );
}

async function deletePeoplePartyRecord({
  typeofcontact,
  docketnum,
  param,
  username,
  transaction,
}) {
  const peopleId = param.people_id || param.peopleId;
  const party = await PeopleDetails.findOne({
    where: { peopleId },
    transaction,
    raw: true,
  });
  if (
    ["petitioner", "respondent"].includes((typeofcontact || "").toLowerCase())
  ) {
    await updateCaseName(peopleId, docketnum, typeofcontact, transaction);
  }
  await PeopleDetails.destroy({ where: { peopleId }, transaction });
  await insertPartyDeletedHistory(
    docketnum,
    typeofcontact,
    party,
    username,
    transaction,
  );
}

async function deleteAttorneyPartyRecord({
  typeofcontact,
  docketnum,
  param,
  username,
  transaction,
}) {
  const party = await AttorneyByCase.findOne({
    where: { sno: param.sno },
    transaction,
    raw: true,
  });
  await AttorneyByCase.destroy({ where: { sno: param.sno }, transaction });
  if ((typeofcontact || "").toLowerCase() === "petitioner attorney") {
    await Docket.update(
      { attorneyForPetitioner: "" },
      { where: { caseId: docketnum }, transaction },
    );
  }
  await insertPartyDeletedHistory(
    docketnum,
    typeofcontact,
    party,
    username,
    transaction,
  );
}

async function deleteAgencyPartyRecord({
  typeofcontact,
  docketnum,
  param,
  username,
  transaction,
}) {
  const party = await AgencyCaseworkerByCase.findOne({
    where: { sno: param.sno, typeOfContact: typeofcontact },
    transaction,
    raw: true,
  });
  await AgencyCaseworkerByCase.destroy({
    where: { sno: param.sno, typeOfContact: typeofcontact },
    transaction,
  });

  const last = await AgencyCaseworkerByCase.findOne({
    where: { caseId: docketnum },
    order: [["sno", "DESC"]],
    transaction,
  });
  await Docket.update(
    { stateRepresentative: formatPartyName(last) },
    { where: { caseId: docketnum }, transaction },
  );
  await insertPartyDeletedHistory(
    docketnum,
    typeofcontact,
    party,
    username,
    transaction,
  );
}

export const DELETE_PARTY_HANDLERS = {
  minordetails: deleteMinorPartyRecord,
  peopledetails: deletePeoplePartyRecord,
  attorneybycase: deleteAttorneyPartyRecord,
  agencycaseworkerbycase: deleteAgencyPartyRecord,
};
