import { Op } from "sequelize";
import PeopleDetails from "../../models/PeopleDetails.js";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import Docket from "../../models/Docket.js";

// Shared constants/helpers used by the create/update/delete/move handlers for
// per-docket parties (minordetails/peopledetails/agencycaseworkerbycase/
// attorneybycase).

export const PRIMARY_PARTY_TYPES = ["Petitioner", "Respondent", "Claimant"];

export const formatPartyName = (party) =>
  party ? `${party.lastName}, ${party.firstName}` : "";

// snake_case payload (add flow, req.body.partydetails) -> common party fields
export const buildPartyData = (partydetails, contactType, now) => ({
  typeOfContact: contactType,
  lastName: partydetails.last_name,
  firstName: partydetails.first_name,
  middleName: partydetails.middle_name,
  title: partydetails.title,
  company: partydetails.company_name,
  address1: partydetails.address1 ?? null,
  address2: partydetails.address2,
  city: partydetails.city,
  state: partydetails.state,
  zip: partydetails.zip_code,
  phone: partydetails.phone,
  email: partydetails.email,
  fax: partydetails.fax,
  createdDate: now,
  modifiedDate: now,
});

// camelCase payload (edit flow, req.body.editpartydetails) -> common party fields
export const buildPartyUpdateData = (editpartydetails, contactType, now) => ({
  typeOfContact: contactType,
  lastName: editpartydetails.lastName,
  firstName: editpartydetails.firstName,
  middleName: editpartydetails.middleName,
  title: editpartydetails.title,
  company: editpartydetails.companyName,
  address1: editpartydetails.addressLine1,
  address2: editpartydetails.addressLine2,
  city: editpartydetails.city,
  state: editpartydetails.state,
  zip: editpartydetails.zipCode,
  phone: editpartydetails.phone,
  email: editpartydetails.email,
  fax: editpartydetails.fax,
  isInternationalAddr: editpartydetails.isInternationalAddr ?? "0",
  internationalAddress: editpartydetails.internationalAddress ?? "",
  modifiedDate: now,
});

// Alternate ("second") address is only ever meaningful for Petitioner/
// Respondent — mirrors legacy AAA_flag_type (docketcontroller.js:919-937) —
// and only when the party isn't using an international address (legacy
// nested the whole "Add Alternate Address" block inside the
// `internationalAddr=='0'` span). peopledetails is the only table with
// alt_* columns, so these are only ever spread into that table's data.
export const isPetitionerOrRespondent = (contactType) =>
  ["petitioner", "respondent"].includes(String(contactType || "").toLowerCase());

const EMPTY_ALT_ADDRESS = {
  altAddress1: "",
  altAddress2: "",
  altCity: "",
  altState: "",
  altZipCode: "",
};

const isAltAddressEligible = (contactType, isInternationalAddr) =>
  isPetitionerOrRespondent(contactType) &&
  String(isInternationalAddr ?? "0") !== "1";

// snake_case payload (add flow, req.body.partydetails) -> alt_* fields, or
// blanks if this contact type/international choice isn't eligible — every
// ineligible combination force-clears the columns regardless of what a
// client sends, so stale data can never persist on a row it doesn't apply to.
export const buildAltAddressFromSnakeCase = (partydetails, contactType) =>
  isAltAddressEligible(contactType, partydetails.is_international_addr)
    ? {
        altAddress1: partydetails.alt_address1 || "",
        altAddress2: partydetails.alt_address2 || "",
        altCity: partydetails.alt_city || "",
        altState: partydetails.alt_state || "",
        altZipCode: partydetails.alt_zip_code || "",
      }
    : EMPTY_ALT_ADDRESS;

// camelCase payload (edit flow, req.body.editpartydetails) -> alt_* fields;
// same eligibility/clearing rule as buildAltAddressFromSnakeCase above.
export const buildAltAddressFromCamelCase = (editpartydetails, contactType) =>
  isAltAddressEligible(contactType, editpartydetails.isInternationalAddr)
    ? {
        altAddress1: editpartydetails.altAddress1 || "",
        altAddress2: editpartydetails.altAddress2 || "",
        altCity: editpartydetails.altCity || "",
        altState: editpartydetails.altState || "",
        altZipCode: editpartydetails.altZipCode || "",
      }
    : EMPTY_ALT_ADDRESS;

export const findPublicAccessEServices = async (email, transaction) => {
  const publicUser = await PublicAccessUser.findOne({
    where: { email },
    transaction,
  });
  return publicUser?.eServices || "0";
};

// Recomputes Docket.caseName from the next-most-recent Petitioner/Respondent
// row once `peopleId` stops representing the case name (edited away or
// deleted). Mirrors legacy PHP's case-name-recalculation-on-change behavior.
export const updateCaseName = async (
  peopleId,
  docketnum,
  typeOfContact,
  transaction,
) => {
  let caseName = "";
  const isPetitioner = typeOfContact.toLowerCase() === "petitioner";
  const isRespondent = typeOfContact.toLowerCase() === "respondent";

  if (isPetitioner || isRespondent) {
    // Petitioner is always tried first, then Respondent — excluding
    // `peopleId` only matters on the query matching the row actually being
    // changed (a no-op on the other type, since peopleId can't match a
    // different-type row anyway).
    const petitioner = await PeopleDetails.findOne({
      where: {
        caseId: docketnum,
        typeOfContact: "Petitioner",
        ...(isPetitioner ? { peopleId: { [Op.ne]: peopleId } } : {}),
      },
      order: [["peopleId", "DESC"]],
      transaction,
    });
    caseName = formatPartyName(petitioner);

    if (!caseName) {
      const respondent = await PeopleDetails.findOne({
        where: {
          caseId: docketnum,
          typeOfContact: "Respondent",
          ...(isRespondent ? { peopleId: { [Op.ne]: peopleId } } : {}),
        },
        order: [["peopleId", "DESC"]],
        transaction,
      });
      caseName = formatPartyName(respondent);
    }
  }

  await Docket.update(
    { caseName },
    { where: { caseId: docketnum }, transaction },
  );
};

// Sets whichever docket-level field (casename/staterepresentative/
// attorneyforpetitioner) reflects the party currently occupying `tableName`.
export const syncDocketFieldForTable = async (
  tableName,
  contactType,
  lastName,
  firstName,
  docketNumber,
  transaction,
) => {
  if (
    tableName === "peopledetails" &&
    PRIMARY_PARTY_TYPES.includes(contactType)
  ) {
    await Docket.update(
      { caseName: `${lastName}, ${firstName}` },
      { where: { caseId: docketNumber }, transaction },
    );
  }

  if (tableName === "agencycaseworkerbycase") {
    await Docket.update(
      { stateRepresentative: `${lastName}, ${firstName}` },
      { where: { caseId: docketNumber }, transaction },
    );
  }

  if (tableName === "attorneybycase" && contactType === "Petitioner Attorney") {
    await Docket.update(
      { attorneyForPetitioner: `${lastName}, ${firstName}` },
      { where: { caseId: docketNumber }, transaction },
    );
  }
};
