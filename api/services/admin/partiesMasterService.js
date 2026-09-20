import { Op } from "sequelize";
import TypeOfContact from "../../models/TypeOfContact.js";
import AgencyCaseworkerByCaseMaster from "../../models/admin/agencyCaseworkerByCaseMasterModel.js";
import AttorneyByCaseMaster from "../../models/admin/attorneyByCaseMasterModel.js";
import AdminHistory from "../../models/admin/adminHistoryModel.js";

// Single source of truth for how each party contact type maps to its master
// table, the extra columns it carries, and the defaults a brand-new row needs
// (contactId/attorneyId placeholder + active/not-deleted flags).
export const CONTACT_TABLE_CONFIG = {
  agencycaseworkerbycase: {
    model: AgencyCaseworkerByCaseMaster,
    buildFields: (src) => ({
      isGeorgiaState: src.is_georgia_state || "0",
      badgeNo: src.badge_no || "",
    }),
    newRecordDefaults: { contactId: "0", isActive: "1" },
  },
  attorneybycase: {
    model: AttorneyByCaseMaster,
    buildFields: (src) => ({
      attorneyBar: src.attorney || "",
    }),
    newRecordDefaults: { attorneyId: "0", isActive: "1" },
  },
};

export const mapPartyFields = (src) => ({
  lastName: src.lastName,
  firstName: src.firstName,
  middleName: src.middleName,
  title: src.title,
  company: src.companyName,
  address1: src.addressLine1,
  address2: src.addressLine2,
  city: src.city,
  state: src.state,
  zip: src.zipCode,
  phone: src.phone,
  email: src.email,
  fax: src.fax,
});

export const findDuplicateParty = (
  model,
  { lastName, firstName, address1, typeOfContact, excludeSno },
  transaction,
) => {
  const where = {
    lastName,
    firstName,
    address1,
    typeOfContact,
  };
  if (excludeSno) {
    where.sno = { [Op.ne]: excludeSno };
  }
  return model.findOne({ where, transaction });
};

export const logAdminHistory = ({ values, userId, action, transaction }) =>
  AdminHistory.create(
    {
      new_values: JSON.stringify(values),
      modified_by: userId || null,
      module_name: "parties",
      action_name: action,
      modified_date: new Date(),
    },
    { transaction },
  );

// Shared by createParty and updateParty's cross-table move: dedup check,
// then INSERT + history log if the row is clear.
export const createNewPartyRecord = async ({
  config,
  data,
  extraData,
  typeOfContact,
  userId,
  transaction,
}) => {
  const duplicate = await findDuplicateParty(
    config.model,
    {
      lastName: data.lastName,
      firstName: data.firstName,
      address1: data.address1,
      typeOfContact,
    },
    transaction,
  );

  if (duplicate) {
    return { conflict: true };
  }

  const values = { ...data, ...extraData, ...config.newRecordDefaults };
  await config.model.create(values, { transaction });
  await logAdminHistory({ values, userId, action: "create", transaction });

  return { conflict: false };
};

// editpartydetails identifies the row to update by sno, then caseId, then
// falls back to a name + contact-type match for legacy callers without either.
export const buildPartyLookupCondition = (
  editpartydetails,
  contactTypeForFallback,
) =>
  editpartydetails.sno
    ? { sno: editpartydetails.sno }
    : editpartydetails.caseid &&
        editpartydetails.caseid !== "0" &&
        editpartydetails.caseid !== 0
      ? { caseId: editpartydetails.caseid }
      : {
          firstName:
            editpartydetails.original_firstName || editpartydetails.firstName,
          lastName:
            editpartydetails.original_lastName || editpartydetails.lastName,
          typeOfContact: contactTypeForFallback,
          isActive: "1",
        };

// Contact type changed to one backed by a different master table: dedup
// check + INSERT into the new table, then soft-delete the old row — mirrors
// the legacy PHP editPartyAction's insert-new/delete-old behavior (soft
// delete to match this codebase's existing deletePartyMaster convention
// rather than a hard DELETE).
export const movePartyToNewTable = async ({
  config,
  previousConfig,
  data,
  extraData,
  contactType,
  previousContactType,
  editpartydetails,
  userId,
  transaction,
}) => {
  const { conflict } = await createNewPartyRecord({
    config,
    data: { ...data, createdDate: new Date() },
    extraData,
    typeOfContact: contactType,
    userId,
    transaction,
  });

  if (conflict) {
    return { conflict: true };
  }

  if (previousConfig) {
    const previousLookupCondition = buildPartyLookupCondition(
      editpartydetails,
      previousContactType,
    );
    const [removedRows] = await previousConfig.model.update(
      { modifiedDate: new Date() },
      { where: previousLookupCondition, transaction },
    );

    if (removedRows) {
      await logAdminHistory({
        values: previousLookupCondition,
        userId,
        action: "delete",
        transaction,
      });
    }
  }

  return { conflict: false };
};

// Same table: dedup check (excluding this row), then update in place.
export const updatePartyInPlace = async ({
  config,
  data,
  extraData,
  contactType,
  editpartydetails,
  userId,
  transaction,
}) => {
  const duplicate = await findDuplicateParty(
    config.model,
    {
      lastName: data.lastName,
      firstName: data.firstName,
      address1: data.address1,
      typeOfContact: contactType,
      excludeSno: editpartydetails.sno,
    },
    transaction,
  );

  if (duplicate) {
    return { status: "conflict" };
  }

  const updateCondition = buildPartyLookupCondition(
    editpartydetails,
    contactType,
  );
  const values = { ...data, ...extraData };

  const [updatedRows] = await config.model.update(values, {
    where: updateCondition,
    transaction,
  });

  if (!updatedRows) {
    return { status: "not_found" };
  }

  await logAdminHistory({ values, userId, action: "update", transaction });

  return { status: "updated" };
};

// A contact type's table mapping can be changed after parties were already
// created under it, so a party's sno may no longer live in the currently
// mapped table. Try the mapped table first, then fall back to the other one.
export const updatePartyBySno = async (primaryModel, sno, updateData) => {
  const [primaryUpdated] = await primaryModel.update(updateData, {
    where: { sno },
  });

  if (primaryUpdated) {
    return primaryUpdated;
  }

  const fallbackModel = Object.values(CONTACT_TABLE_CONFIG).find(
    (config) => config.model !== primaryModel,
  )?.model;

  if (!fallbackModel) {
    return 0;
  }

  const [fallbackUpdated] = await fallbackModel.update(updateData, {
    where: { sno },
  });

  return fallbackUpdated;
};

// Same primary/fallback table lookup as updatePartyBySno, but hard-deletes
// the row instead of soft-deleting it.
export const destroyPartyBySno = async (primaryModel, sno, transaction) => {
  const primaryDestroyed = await primaryModel.destroy({
    where: { sno },
    transaction,
  });

  if (primaryDestroyed) {
    return primaryDestroyed;
  }

  const fallbackModel = Object.values(CONTACT_TABLE_CONFIG).find(
    (config) => config.model !== primaryModel,
  )?.model;

  if (!fallbackModel) {
    return 0;
  }

  return fallbackModel.destroy({ where: { sno }, transaction });
};

export const requirePartyTableConfig = async (typeofcontact) => {
  const type = await TypeOfContact.findOne({
    where: isNaN(typeofcontact)
      ? { partycontact: typeofcontact }
      : { id: typeofcontact },
    attributes: ["id", "tableName"],
  });

  if (!type) {
    return { error: "Contact type not found" };
  }

  const config = CONTACT_TABLE_CONFIG[type.tableName];
  if (!config) {
    return { error: `Invalid table name: ${type.tableName}` };
  }

  return { config };
};
