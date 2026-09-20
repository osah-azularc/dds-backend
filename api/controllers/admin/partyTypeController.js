import partyType from "../../models/admin/partyTypeModel.js";
import { Op } from "sequelize";
import { validatePartyType } from "../../../helpers/validation.js";
import {
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from "../../constants/constant-messages.js";
import { insertModuleAuditLog } from "../../helpers/auditLogs.helper.js";
import { logger } from "../../../config/winstonLogger.js";
const moduleNames = [AUDIT_LOG_MODULE_NAME.PARTY_TYPES];

export const getPartyType = async (req, res) => {
  const { party_type_id, party_type_name, fetchActivePartyType } = req.body;

  try {
    let where = {};
    if (party_type_id) {
      where = {
        id: party_type_id,
      };
    }
    if (party_type_name != "" && party_type_name != undefined) {
      where = {
        party_type_name: { [Op.iLike]: "%" + party_type_name + "%" },
      };
    }
    if (fetchActivePartyType) {
      where = {
        is_active: "1",
      };
    }

    const partyTypes = await partyType.findAll({
      where,
      attributes: [
        "id",
        "party_type_name",
        "is_autocomplete",
        "is_attorney",
        "is_active",
      ],
      order: [["id", "ASC"]],
    });
    return res
      .status(200)
      .json({ status: 200, data: partyTypes, success: true });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({ status: 500, success: false });
  }
};

export const createPartyType = async (req, res) => {
  let { party_type_name, is_autocomplete, is_attorney } = req.body;
  const user_id = req.userId;
  if (party_type_name) {
    party_type_name = party_type_name.trim();
  }

  try {
    const validationErrors = await validatePartyType(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to add Party Type",
        message: validationErrors,
        success: false,
      });
    }

    let party_type_table = "partydetails";
    if (
      party_type_name == "Minor/children" ||
      party_type_name == "Minor/Children"
    ) {
      party_type_table = "minordetails";
    }
    const newPartyType = await partyType.create({
      party_type_name,
      party_type_table,
      is_autocomplete,
      is_attorney,
      created_by: user_id,
      created_date: new Date(),
    });

    // AUDIT LOG FOR CREATE PARTY TYPE : START
    if (newPartyType) {
      for (const moduleName of moduleNames) {
        insertModuleAuditLog(
          user_id,
          AUDIT_LOG_ACTIONS.CREATED,
          `{{User}} created ${newPartyType.party_type_name}`,
          moduleName,
          "",
          newPartyType.dataValues.id,
          "",
          "",
          "",
        );
      }
    }
    // AUDIT LOG FOR CREATE PARTY TYPE : END

    return res.status(200).json({
      status: 200,
      message: "Party Type successfully added",
      data: newPartyType,
      success: true,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to add Party Type",
      message: "The Party Type could not be added this time. Please try again.",
      success: false,
    });
  }
};

export const updatePartyType = async (req, res) => {
  let { id, party_type_name, is_autocomplete, is_attorney } = req.body;
  const user_id = req.userId;
  if (party_type_name) {
    party_type_name = party_type_name.trim();
  }
  try {
    const validationErrors = await validatePartyType(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to update Party Type",
        message: validationErrors,
        success: false,
      });
    }

    if (id && id > 0) {
      const updateData = {
        party_type_name,
        is_autocomplete,
        is_attorney,
        updated_by: user_id,
        updated_date: new Date(),
      };
      const originalData = await partyType.findByPk(id, {
        attributes: ["party_type_name", "is_autocomplete", "is_attorney"],
      });

      const changes = {};
      const updatedData = { ...updateData };
      delete updatedData.updated_by;
      delete updatedData.updated_date;
      for (const key in updatedData) {
        if (
          updatedData.hasOwnProperty(key) &&
          originalData[key] != updatedData[key]
        ) {
          changes[key] = {
            original: originalData[key] ?? "",
            updated: updatedData[key] ?? "",
          };
        }
      }
      const updatedPartyType = await partyType.update(updateData, {
        where: { id: id },
      });

      // AUDIT LOG FOR UPDATE PARTY TYPE : START
      if (changes && updatedPartyType) {
        for (const moduleName of moduleNames) {
          for (const [key, value] of Object.entries(changes)) {
            await insertModuleAuditLog(
              user_id,
              AUDIT_LOG_ACTIONS.EDITED,
              `{{User}} edited ${updatedData.party_type_name}`,
              moduleName,
              key,
              id,
              value.original,
              value.updated,
              "",
            );
          }
        }
      }
      // AUDIT LOG FOR UPDATE PARTY TYPE : END

      return res.status(200).json({
        status: 200,
        message: "Party Type successfully updated",
        data: updatedPartyType,
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to update Party Type",
      message:
        "The Party Type could not be updated this time. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to update Party Type",
      message:
        "The Party Type could not be updated this time. Please try again.",
      success: false,
    });
  }
};

export const updatePartyTypeStatus = async (req, res) => {
  const { id, is_active } = req.body;
  const user_id = req.userId;
  try {
    let message = "deactivated";
    let errMessageTitle = "Unable to deactivate Party Type";
    let errMessage =
      "The Party Type could not be deactivated at this time. Please try again.";
    if (is_active == "1") {
      message = "restored for use";
      errMessageTitle = "Unable to restore Party Type for use";
      errMessage =
        "The Party Type could not be restored for use at this time. Please try again.";
    }

    if (id && id > 0) {
      const updatedPartyTypeStatus = await partyType.update(
        { is_active, updated_by: user_id, updated_date: new Date() },
        { where: { id: id } },
      );

      // AUDIT LOG FOR ACTIVATE/DEACTIVATE PARTY TYPE : START
      const updatedPartyTypeData = await partyType.findByPk(id);
      if (updatedPartyTypeData) {
        for (const moduleName of moduleNames) {
          insertModuleAuditLog(
            user_id,
            AUDIT_LOG_ACTIONS.CHANGED_STATUS,
            `{{User}} changed status of ${updatedPartyTypeData.party_type_name}`,
            moduleName,
            "is_active",
            id,
            is_active == "1" ? "0" : "1",
            is_active,
            "",
          );
        }
      }
      // AUDIT LOG FOR ACTIVATE/DEACTIVATE PARTY TYPE : END

      return res.status(200).json({
        status: 200,
        message: "Party Type successfully " + message,
        data: updatedPartyTypeStatus,
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: errMessageTitle,
      message: errMessage,
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to update Party Type status",
      message:
        "The Party Type status could not be updated this time. Please try again.",
      success: false,
    });
  }
};
