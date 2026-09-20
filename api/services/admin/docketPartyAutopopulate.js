import { Op } from "sequelize";
import MinorDetails from "../../models/MinorDetails.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import TypeOfContact from "../../models/TypeOfContact.js";
import AgencyCaseworkerByCaseMaster from "../../models/admin/agencyCaseworkerByCaseMasterModel.js";
import AttorneyByCaseMaster from "../../models/admin/attorneyByCaseMasterModel.js";

// ─── Autopopulate (autopopulateParty) ───────────────────────────────────────
// Mirrors legacy PHP's /Osahform/autopopulate: given a contact type, return the
// list of previously-entered parties of that type so the "Add Party" form's
// Last Name field can suggest/prefill them. Attorney and agency-caseworker
// parties are read from their *master* (deduped) tables; petitioner/respondent
// and minor parties come from their per-case tables.

const AUTOPOPULATE_MODEL_MAP = {
  attorneybycase: AttorneyByCaseMaster,
  agencycaseworkerbycase: AgencyCaseworkerByCaseMaster,
  peopledetails: PeopleDetails,
  minordetails: MinorDetails,
};

// Party fields returned for suggestion display and form prefill. Only the ones
// a given model actually defines are selected (e.g. minordetails has no
// title/company/fax), so this stays a superset that is filtered per model.
const AUTOPOPULATE_FIELDS = [
  "lastName",
  "firstName",
  "middleName",
  "title",
  "company",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "fax",
];

// Returns null when the contact type is unknown, [] when it maps to no
// supported table, otherwise the deduped party list for that contact type.
export async function getPartyAutopopulateList(contactType) {
  const typeOfContact = await TypeOfContact.findOne({
    where: { partyContact: contactType },
  });
  if (!typeOfContact) return null;

  const Model = AUTOPOPULATE_MODEL_MAP[typeOfContact.tableName];
  if (!Model) return [];

  const attributes = AUTOPOPULATE_FIELDS.filter((f) => Model.rawAttributes[f]);

  const where = {
    lastName: { [Op.ne]: "" },
    is_active: 1,
  };
  // minordetails has no typeofcontact column (all rows are minor children);
  // every other table scopes suggestions to the selected contact type.
  if (Model.rawAttributes.typeOfContact) where.typeOfContact = contactType;

  const rows = await Model.findAll({
    where,
    attributes,
    order: [["lastName", "ASC"]],
    raw: true,
  });

  // Dedupe on name + address1 so the same party isn't suggested repeatedly.
  const seen = new Set();
  const list = [];
  for (const row of rows) {
    const key = [row.lastName, row.firstName, row.address1]
      .map((v) => (v || "").trim().toLowerCase())
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(row);
  }
  return list;
}
