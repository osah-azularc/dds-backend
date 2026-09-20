import TypeOfContact from "../../models/TypeOfContact.js";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import { successResponse, failureResponse } from "../../../helpers/helper.js";
import {
  CONTACT_TABLE_CONFIG,
  mapPartyFields,
  createNewPartyRecord,
  movePartyToNewTable,
  updatePartyInPlace,
  updatePartyBySno,
  destroyPartyBySno,
  logAdminHistory,
  requirePartyTableConfig,
} from "../../services/admin/partiesMasterService.js";

/*
	Name : Sharan Patil
	Date Created : 08 Jan, 2025
	Description : Admin Settings, Parties: Create new party record based on contact type.
*/
export const createParty = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const { partydetails } = req.body;

    const contactType = await TypeOfContact.findByPk(partydetails.contactType, {
      transaction,
    });

    if (!contactType) {
      await transaction.rollback();
      return failureResponse(res, "Contact type not found", 404);
    }

    const currentDatetime = new Date();
    const baseData = {
      ...mapPartyFields(partydetails),
      typeOfContact: contactType.partyContact,
      contactTypeId: contactType.id,
      docketCaseId: partydetails.Docket_caseid,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    };

    const config = CONTACT_TABLE_CONFIG[contactType.tableName];

    if (!config) {
      await transaction.commit();
      return successResponse(res, "Party added successfully");
    }

    const { conflict } = await createNewPartyRecord({
      config,
      data: baseData,
      extraData: config.buildFields(partydetails),
      typeOfContact: baseData.typeOfContact,
      userId: req.user?.userId,
      transaction,
    });

    if (conflict) {
      await transaction.rollback();
      return failureResponse(res, "Party already exists!", 400);
    }

    await transaction.commit();
    return successResponse(res, "Party added successfully");
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

/*
  Name : Sharan Patil
  Date Created : 09 Jan, 2025
  Description : Admin Settings, Parties: Update existing party record based on contact type.
*/
export const updateParty = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const { editpartydetails } = req.body;

    if (!editpartydetails) {
      await transaction.rollback();
      return failureResponse(res, "Missing party details");
    }

    const contactType = editpartydetails.typeofcontact;
    const previousContactType =
      editpartydetails.previous_contacttype || contactType;

    const type = await TypeOfContact.findOne({
      where: { partyContact: contactType },
      transaction,
    });

    if (!type) {
      await transaction.rollback();
      return failureResponse(res, "Contact type not found");
    }

    // Resolve the table the party's *previous* contact type belonged to, so
    // we can detect a type change that moves the party to a different table.
    let previousTableName = type.tableName;
    if (previousContactType && previousContactType !== contactType) {
      const previousType = await TypeOfContact.findOne({
        where: { partyContact: previousContactType },
        transaction,
      });
      if (previousType) {
        previousTableName = previousType.tableName;
      }
    }

    const data = {
      ...mapPartyFields(editpartydetails),
      typeOfContact: contactType,
      contactTypeId: type.id,
      isInternationalAddr: editpartydetails.isInternationalAddr ?? "0",
      internationalAddress: editpartydetails.internationalAddress ?? "",
      modifiedDate: new Date(),
    };

    const config = CONTACT_TABLE_CONFIG[type.tableName];

    if (!config) {
      await transaction.commit();
      return successResponse(res, "Party updated successfully");
    }

    const extraData = config.buildFields(editpartydetails);
    const userId = req.user?.userId;

    if (previousTableName !== type.tableName) {
      const { conflict } = await movePartyToNewTable({
        config,
        previousConfig: CONTACT_TABLE_CONFIG[previousTableName],
        data,
        extraData,
        contactType,
        previousContactType,
        editpartydetails,
        userId,
        transaction,
      });

      if (conflict) {
        await transaction.rollback();
        return failureResponse(res, "Party already exists!", 400);
      }

      await transaction.commit();
      return successResponse(res, "Party updated successfully");
    }

    const { status } = await updatePartyInPlace({
      config,
      data,
      extraData,
      contactType,
      editpartydetails,
      userId,
      transaction,
    });

    if (status === "conflict") {
      await transaction.rollback();
      return failureResponse(res, "Party already exists!", 400);
    }

    if (status === "not_found") {
      await transaction.rollback();
      return failureResponse(res, "Party not found for update");
    }

    await transaction.commit();
    return successResponse(res, "Party updated successfully");
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

/*
  Name : Sharan Patil
  Date Created : 11 Jan, 2025
  Description : Delete party record from master tables (hard delete).
*/
export const deletePartyMaster = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const { sno, typeofcontact } = req.body;

    if (!sno) {
      await transaction.rollback();
      return failureResponse(res, "Missing party ID (sno)");
    }

    if (!typeofcontact) {
      await transaction.rollback();
      return failureResponse(res, "Missing contact type");
    }

    const { config, error } = await requirePartyTableConfig(typeofcontact);
    if (error) {
      await transaction.rollback();
      return failureResponse(res, error);
    }

    const destroyedRows = await destroyPartyBySno(config.model, sno, transaction);

    if (!destroyedRows) {
      await transaction.rollback();
      return failureResponse(res, "Party not found for deletion");
    }

    await logAdminHistory({
      values: { sno, typeofcontact },
      userId: req.user?.userId,
      action: "delete",
      transaction,
    });

    await transaction.commit();
    return successResponse(res, "Party deleted successfully");
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

/*
  Name : Sharan Patil
  Date Created : 11 Jan, 2025
  Description : Admin Settings, Parties: Set party status (active/inactive) or delete party record based on contact type.
*/
export const setPartyStatus = async (req, res) => {
  try {
    const { typeofcontact, sno, caseid, is_active, flag } = req.body;

    const partyId = sno || caseid;

    if (!typeofcontact || !flag) {
      return failureResponse(
        res,
        "Missing required parameters: typeofcontact, flag",
      );
    }

    if (!partyId) {
      return failureResponse(res, "Missing party ID (sno)");
    }

    const { config, error } = await requirePartyTableConfig(typeofcontact);
    if (error) {
      return failureResponse(res, error);
    }

    const updateData =
      flag === "set_status"
        ? { isActive: is_active, modifiedDate: new Date() }
        : { isDeleted: "1", modifiedDate: new Date() };

    const updatedRows = await updatePartyBySno(
      config.model,
      partyId,
      updateData,
    );

    if (!updatedRows) {
      return failureResponse(
        res,
        flag === "set_status"
          ? "Party record not found for status update"
          : "Party record not found for deletion",
      );
    }

    return successResponse(
      res,
      flag === "set_status"
        ? "Party status updated successfully"
        : "Party deleted successfully",
    );
  } catch (error) {
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};
