import { Op } from "sequelize";
import TypeOfContact from "../../models/TypeOfContact.js";
import { logger } from "../../../config/winstonLogger.js";

/* 
  Name : Sharan Patil
  Date Created : 01 Sep, 2025
  Description : Contact Type Management - Add/Edit contact types using TypeOfContact model
*/
export const contactAddEdit = async (req, res) => {
  try {
    // Check if user has admin access (using middleware instead of session)
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        status: 401,
      });
    }

    const param = req.body;
    const currentDateTime = new Date();

    // Validate required fields
    if (!param.data || !param.data.partyContact) {
      return res.status(400).json({
        success: false,
        error: "Contact name is required",
        status: 400,
      });
    }

    // Set table name based on tableStatus
    if (param.tableStatus && param.tableStatus.peopleDetails !== undefined) {
      if (param.tableStatus.peopleDetails === "0") {
        param.data.tableName = "peopledetails";
      } else {
        if (param.tableStatus.attorneyParty === "1") {
          param.data.tableName = "attorneybycase";
        } else {
          param.data.tableName = "agencycaseworkerbycase";
        }
      }
    }

    if (param.status === 0) {
      // Adding new contact type

      // Check for duplicate contact name
      const existingContact = await TypeOfContact.findOne({
        where: {
          partyContact: param.data.partyContact.trim(),
        },
      });

      if (existingContact) {
        return res.status(409).json({
          success: false,
          error: "Contact type already exists",
          message: `Contact type "${param.data.partyContact.trim()}" already exists in the system`,
          status: 409,
        });
      }

      // Create new contact type
      const isOfficerValue = param.data.isOfficer === "yes" ? 1 : 0;

      const newContactType = await TypeOfContact.create({
        partyContact: param.data.partyContact.trim(),
        tableName: param.data.tableName,
        isOfficer: isOfficerValue,
        created_by: req.userId.toString(),
        modified_by: req.userId.toString(),
        created_date: currentDateTime,
        modified_date: currentDateTime,
      });

      return res.status(201).json({
        success: true,
        data: newContactType,
        message: "Contact type created successfully",
        status: 201,
      });
    } else {
      // Updating existing contact type

      if (!param.data.id) {
        return res.status(400).json({
          success: false,
          error: "Contact type ID is required for update",
          status: 400,
        });
      }

      // Check if contact type exists
      const existingContact = await TypeOfContact.findByPk(param.data.id);

      if (!existingContact) {
        return res.status(404).json({
          success: false,
          error: "Contact type not found",
          status: 404,
        });
      }

      // Check for duplicate name (excluding current record)
      const duplicateContact = await TypeOfContact.findOne({
        where: {
          partyContact: param.data.partyContact.trim(),
          id: { [Op.ne]: param.data.id },
        },
      });

      if (duplicateContact) {
        return res.status(409).json({
          success: false,
          error: "Contact type name already exists",
          message: `Another contact type with name "${param.data.partyContact.trim()}" already exists`,
          status: 409,
        });
      }

      // Update contact type
      const isOfficerValue = param.data.isOfficer === "yes" ? 1 : 0;

      try {
        const updateResult = await TypeOfContact.update(
          {
            partyContact: param.data.partyContact.trim(),
            tableName: param.data.tableName,
            isOfficer: isOfficerValue,
            modified_by: req.userId.toString(),
            modified_date: currentDateTime,
          },
          {
            where: { id: param.data.id },
          },
        );

        const updatedContact = await TypeOfContact.findByPk(param.data.id);

        if (!updateResult || updateResult[0] === 0) {
          return res.status(400).json({
            success: false,
            error: "Failed to update contact type",
            status: 400,
          });
        }
      } catch (updateError) {
        logger.error("UPDATE CONTACT TYPE ERROR:", updateError);

        return res.status(500).json({
          success: false,
          error: "Error while updating contact type",
          details: updateError.message,
          status: 500,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Contact type updated successfully",
        status: 200,
      });
    }
  } catch (error) {
    logger.error("CONTACT ADD/EDIT ERROR:", error);
    // Handle specific database errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors.map((err) => ({
          field: err.path,
          message: err.message,
        })),
        status: 400,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to process contact type",
      status: 500,
    });
  }
};

/* 
  Name : Sharan Patil
  Date Created : 01 Sep, 2025
  Description : Get all contact types
*/
export const getAllContactTypes = async (req, res) => {
  try {
    const contactTypes = await TypeOfContact.findAll({
      order: [["partyContact", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: contactTypes,
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch contact types",
      status: 500,
    });
  }
};

export const getContactType = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid contact type ID",
        status: 400,
      });
    }

    const contactType = await TypeOfContact.findByPk(id);

    if (!contactType) {
      return res.status(404).json({
        success: false,
        error: "Contact type not found",
        status: 404,
      });
    }

    return res.status(200).json({
      success: true,
      data: contactType,
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch contact type",
      status: 500,
    });
  }
};

export const deleteContactType = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid contact type ID",
        status: 400,
      });
    }

    const contactType = await TypeOfContact.findByPk(id);

    if (!contactType) {
      return res.status(404).json({
        success: false,
        error: "Contact type not found",
        status: 404,
      });
    }

    await TypeOfContact.destroy({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Contact type deleted successfully",
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete contact type",
      status: 500,
    });
  }
};
