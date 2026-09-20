import { mysqlSequelize } from "../../../connections/seqDB.js";
import TypeOfContact from "../../models/TypeOfContact.js";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import ExternalDocuments from "../../models/ExternalDocuments.js";
import PublicAccessMappingTable from "../../models/PublicAccessMappingTable.js";
import { successResponse, failureResponse } from "../../../helpers/helper.js";
import {
  CREATE_PARTY_HANDLERS,
  UPDATE_PARTY_HANDLERS,
  DELETE_PARTY_HANDLERS,
  movePartyAcrossTables,
  getPartyAutopopulateList,
} from "../../services/admin/docketPartyService.js";
import { reassignHearingInfoForOfficerParty } from "../../helpers/docketDetail/officerHearingReassignmentHelper.js";
import { resyncCaseOfficialOnPartyChange } from "../../helpers/checkinCalendarHelper.js";
import { logger } from "../../../config/winstonLogger.js";

// Gate 1 (mirrors PHP editpartydetailsAction: if(ucwords($contact_type) == 'Officer')):
// only an Officer party landing in agencycaseworkerbycase can trigger the Fulton
// county-hearing reassignment cascade. Fire-and-forget, non-fatal — the party save
// already committed by the time this runs (see officerHearingReassignmentHelper.js
// for Gates 2-4).
const triggerOfficerHearingReassignment = (tableName, contactType, docketNumber, city, username, userId) => {
  if (tableName !== "agencycaseworkerbycase" || String(contactType || "").trim() !== "Officer") {
    return;
  }
  reassignHearingInfoForOfficerParty(docketNumber, city, { modifiedBy: username, userId }).catch((err) => {
    logger.error("[docketPartyController] triggerOfficerHearingReassignment failed", { docketNumber, error: err?.message ?? err });
  });
};

// Case Official re-sync (Story US3): agencycaseworkerbycase is the sole source
// table for the Officer/Investigator/Case Worker/Agency Contact roles the
// Case Official cell can resolve to, so ANY create/update/delete touching
// that table for a docket - not just the Officer-only reassignment gate above -
// can change what checkin_calendar_today_date.case_official should show today.
// `tableNames` covers both the current and (for an update that moves a party
// to a different contact-type table) previous table, so a party moving into
// OR out of agencycaseworkerbycase both trigger a re-sync. Fire-and-forget,
// non-fatal — see resyncCaseOfficialOnPartyChange's own contract.
const triggerCaseOfficialResync = (tableNames, docketNumber, userId) => {
  if (!tableNames.includes("agencycaseworkerbycase")) return;
  resyncCaseOfficialOnPartyChange(docketNumber, { userId }).catch((err) => {
    logger.error("[docketPartyController] triggerCaseOfficialResync failed", { docketNumber, error: err?.message ?? err });
  });
};

const rollbackWithError = async (transaction, res, message, status = 400) => {
  await transaction.rollback();
  return failureResponse(res, message, status);
};

const commitSuccess = async (transaction, res, message) => {
  await transaction.commit();
  return successResponse(res, message);
};

export const createPartyDocket = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const { partydetails } = req.body;
    const contactType = partydetails.contactType;
    const docketNumber = partydetails.docket_number;
    const now = new Date();
    const username = req.user?.email?.split("@")[0] || "system";

    const typeOfContact = await TypeOfContact.findOne({
      where: { partyContact: contactType },
      transaction,
    });
    if (!typeOfContact) {
      return rollbackWithError(transaction, res, "Contact type not found", 404);
    }

    const handler = CREATE_PARTY_HANDLERS[typeOfContact.tableName];
    if (handler) {
      const { conflict } = await handler({
        partydetails,
        contactType,
        docketNumber,
        now,
        username,
        transaction,
      });
      if (conflict) {
        return rollbackWithError(transaction, res, "Party already exists");
      }
    }

    const result = await commitSuccess(transaction, res, "Party added successfully");
    triggerOfficerHearingReassignment(
      typeOfContact.tableName,
      contactType,
      docketNumber,
      partydetails.city,
      username,
      req.user?.id || 0,
    );
    triggerCaseOfficialResync([typeOfContact.tableName], docketNumber, req.user?.id || 0);
    return result;
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

export const updatePartyDocket = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const { editpartydetails } = req.body;
    if (!editpartydetails) {
      return rollbackWithError(transaction, res, "Missing party details");
    }

    const contactType = editpartydetails.typeofcontact;
    const previousContactType =
      editpartydetails.previous_contacttype || contactType;
    const docketNumber =
      editpartydetails.Docket_caseid || editpartydetails.caseid;
    const now = new Date();
    const username = req.user?.email?.split("@")[0] || "system";

    const typeOfContact = await TypeOfContact.findOne({
      where: { partyContact: contactType },
      transaction,
    });
    if (!typeOfContact) {
      return rollbackWithError(transaction, res, "Contact type not found", 404);
    }

    const { tableName } = typeOfContact;

    // Resolve the table the party's *previous* contact type lived in, so we
    // can detect a type change that moves the party to a different table.
    let previousTableName = tableName;
    if (previousContactType && previousContactType !== contactType) {
      const previousType = await TypeOfContact.findOne({
        where: { partyContact: previousContactType },
        transaction,
      });
      if (previousType) {
        previousTableName = previousType.tableName;
      }
    }

    if (previousTableName !== tableName) {
      const { status } = await movePartyAcrossTables({
        editpartydetails,
        contactType,
        previousContactType,
        tableName,
        previousTableName,
        docketNumber,
        now,
        username,
        transaction,
      });
      if (status === "conflict") {
        return rollbackWithError(transaction, res, "Party already exists");
      }
      if (status === "unsupported") {
        return rollbackWithError(
          transaction,
          res,
          "Unsupported contact type",
          400,
        );
      }
      const moveResult = await commitSuccess(transaction, res, "Party updated successfully");
      triggerOfficerHearingReassignment(
        tableName,
        contactType,
        docketNumber,
        editpartydetails.city,
        username,
        req.user?.id || 0,
      );
      triggerCaseOfficialResync([tableName, previousTableName], docketNumber, req.user?.id || 0);
      return moveResult;
    }

    const handler = UPDATE_PARTY_HANDLERS[tableName];
    if (!handler) {
      return rollbackWithError(
        transaction,
        res,
        "Party not found for update",
        404,
      );
    }

    const { status } = await handler({
      editpartydetails,
      contactType,
      previousContactType,
      docketNumber,
      now,
      username,
      transaction,
    });
    if (status === "conflict") {
      return rollbackWithError(transaction, res, "Party already exists");
    }
    if (status === "not_found") {
      return rollbackWithError(
        transaction,
        res,
        "Party not found for update",
        404,
      );
    }

    const updateResult = await commitSuccess(transaction, res, "Party updated successfully");
    triggerOfficerHearingReassignment(
      tableName,
      contactType,
      docketNumber,
      editpartydetails.city,
      username,
      req.user?.id || 0,
    );
    triggerCaseOfficialResync([tableName], docketNumber, req.user?.id || 0);
    return updateResult;
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

// Legacy PHP equivalent: POST /Osahform/autopopulate. Returns the list of
// existing parties for the given contact type so the docket "Add Party" form's
// Last Name field can offer them as free-text suggestions / prefill.
export const autopopulateParty = async (req, res) => {
  try {
    const contactType = req.body?.contact_type;
    if (!contactType) {
      return failureResponse(res, "Missing contact_type", 400);
    }

    const list = await getPartyAutopopulateList(contactType);
    if (list === null) {
      return failureResponse(res, "Contact type not found", 404);
    }

    return res.status(200).json(list);
  } catch (error) {
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};

export const deletePartyDocket = async (req, res) => {
  const transaction = await mysqlSequelize.transaction();
  try {
    const param = req.body || {};
    const typeofcontact =
      param.typeofcontact || param.typeOfContact || param.contactType;
    const docketnum = param.docket_number || param.docketNumber || param.caseId;
    const username = req.user?.email?.split("@")[0] || "system";

    const typeOfContact = await TypeOfContact.findOne({
      where: { partyContact: typeofcontact },
      transaction,
    });
    if (!typeOfContact) {
      return rollbackWithError(transaction, res, "Contact type not found", 404);
    }

    const { tableName } = typeOfContact;

    // Find any public access users matching the name and check for pending external documents
    const publicUsers = await PublicAccessUser.findAll({
      where: { firstName: param.firstname, lastName: param.lastname },
      transaction,
    });

    for (const user of publicUsers) {
      const doc = await ExternalDocuments.findOne({
        where: { createdBy: user.userId, caseId: docketnum, status: "Pending" },
        transaction,
      });
      if (doc) {
        return rollbackWithError(transaction, res, "documentsExist");
      }
    }

    // remove publicaccess mapping entries for this case
    for (const user of publicUsers) {
      await PublicAccessMappingTable.destroy({
        where: { userId: user.userId, caseId: docketnum },
        transaction,
      });
    }

    const handler = DELETE_PARTY_HANDLERS[tableName];
    if (handler) {
      await handler({ typeofcontact, docketnum, param, username, transaction });
    }

    const deleteResult = await commitSuccess(transaction, res, "Party deleted successfully");
    triggerCaseOfficialResync([tableName], docketnum, req.user?.id || 0);
    return deleteResult;
  } catch (error) {
    await transaction.rollback();
    return failureResponse(res, error.message, 500, "Internal Server Error");
  }
};
