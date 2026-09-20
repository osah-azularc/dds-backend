import AgencyCaseworkerByCaseMaster from "../../models/admin/agencyCaseworkerByCaseMasterModel.js";
import AttorneyByCaseMaster from "../../models/admin/attorneyByCaseMasterModel.js";
import { Sequelize, Op } from "sequelize";

/*
  Description : Mapping of table names to Sequelize models.
*/
const TABLE_MODEL_MAP = {
  attorneybycase: AttorneyByCaseMaster,
  attorneybycase_master: AttorneyByCaseMaster,
  agencycaseworkerbycase: AgencyCaseworkerByCaseMaster,
  agencycaseworkerbycase_master: AgencyCaseworkerByCaseMaster,
};

/*
  Description : Get Sequelize model from table name mapping.
*/
const getModelForTable = (tableName) => {
  const normalizedName = tableName.toLowerCase();
  return TABLE_MODEL_MAP[normalizedName] || null;
};

/*
  Name : Sharan Patil
  Date Created : 11 Jan, 2025
  Description : Get duplicate last names from the selected contact type.
*/
export const getLastname = async (req, res) => {
  try {
    const { tableName, typeofcontact } = req.body;

    if (!tableName || !typeofcontact) {
      return res.status(400).json({
        message: "Missing required parameters: tableName, typeofcontact",
        success: false,
      });
    }

    const Model = getModelForTable(tableName);
    if (!Model) {
      return res.status(400).json({
        message: "Invalid table name",
        success: false,
      });
    }

    const result = await Model.findAll({
      where: {
        isDeleted: "0",
        lastName: { [Op.ne]: "" },
        typeOfContact: typeofcontact,
      },
      attributes: [
        [Sequelize.fn("TRIM", Sequelize.col("Lastname")), "Lastname"],
      ],
      group: [Sequelize.col("Lastname")],
      having: Sequelize.literal("COUNT(Lastname) > 1"),
      order: [[Sequelize.col("Lastname"), "ASC"]],
      raw: true,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: error.message,
      success: false,
    });
  }
};

// Attributes to return for duplicate party details. Built from each model's
// rawAttributes so the correct underlying column is used per table — the two
// tables don't share identical column names for every field (e.g. the
// "international address" flag column is spelled differently between them).
const buildDuplicatePartyAttributes = (Model) => [
  [Model.rawAttributes.sno.field, "sno"],
  [Model.rawAttributes.lastName.field, "Lastname"],
  [Model.rawAttributes.firstName.field, "Firstname"],
  [Model.rawAttributes.middleName.field, "Middlename"],
  [Model.rawAttributes.typeOfContact.field, "typeofcontact"],
  [Model.rawAttributes.address1.field, "Address1"],
  [Model.rawAttributes.address2.field, "Address2"],
  [Model.rawAttributes.city.field, "City"],
  [Model.rawAttributes.state.field, "State"],
  [Model.rawAttributes.zip.field, "Zip"],
  [Model.rawAttributes.title.field, "Title"],
  [Model.rawAttributes.company.field, "Company"],
  [Model.rawAttributes.phone.field, "Phone"],
  [Model.rawAttributes.email.field, "Email"],
  [Model.rawAttributes.fax.field, "Fax"],
  [Model.rawAttributes.isInternationalAddr.field, "isInternationalAddr"],
  [Model.rawAttributes.internationalAddress.field, "internationalAddress"],
  [Model.rawAttributes.createdDate.field, "created_date"],
  [Model.rawAttributes.modifiedDate.field, "modified_date"],
  [Model.rawAttributes.isActive.field, "is_active"],
];

/*
  Name : Sharan Patil
  Date Created : 11 Jan, 2025
  Description : Get duplicate parties by matching address or name.
*/
export const getDuplicateParty = async (req, res) => {
  try {
    // Destructure with aliases: snake_case from API → camelCase for internal use
    const {
      contact_type: contactType,
      selected_lastname: selectedLastname,
      tableName,
    } = req.body;

    if (!contactType || !selectedLastname || !tableName) {
      return res.status(400).json({
        message:
          "Missing required parameters: contact_type, selected_lastname, tableName",
        success: false,
      });
    }

    const Model = getModelForTable(tableName);
    if (!Model) {
      return res.status(400).json({
        message: "Invalid table name",
        success: false,
      });
    }

    let addressDuplicates = [];
    let nameDuplicates = [];

    // Find ADDRESS DUPLICATES groups
    const addressGroups = await Model.findAll({
      where: {
        isDeleted: "0",
        typeOfContact: contactType,
        lastName: selectedLastname,
      },
      attributes: [
        [Sequelize.col("Address1"), "Address1"],
        [Sequelize.col("Lastname"), "Lastname"],
      ],
      group: [Sequelize.col("Address1"), Sequelize.col("Lastname")],
      having: Sequelize.literal("COUNT(Address1) > 1 AND COUNT(Lastname) > 1"),
      raw: true,
    });

    // Get full details of address duplicates
    for (const group of addressGroups) {
      const details = await Model.findAll({
        where: {
          typeOfContact: contactType,
          lastName: selectedLastname,
          address1: group.Address1,
          isDeleted: { [Op.ne]: "1" },
        },
        attributes: buildDuplicatePartyAttributes(Model),
        raw: true,
      });
      addressDuplicates = addressDuplicates.concat(details);
    }

    // Find NAME DUPLICATES groups
    const nameGroups = await Model.findAll({
      where: {
        isDeleted: "0",
        typeOfContact: contactType,
        lastName: selectedLastname,
      },
      attributes: [
        [Sequelize.col("Firstname"), "Firstname"],
        [Sequelize.col("Lastname"), "Lastname"],
      ],
      group: [Sequelize.col("Firstname"), Sequelize.col("Lastname")],
      having: Sequelize.literal("COUNT(Firstname) > 1 AND COUNT(Lastname) > 1"),
      raw: true,
    });

    // Get full details of name duplicates
    for (const group of nameGroups) {
      const details = await Model.findAll({
        where: {
          typeOfContact: contactType,
          lastName: selectedLastname,
          firstName: group.Firstname,
          isDeleted: { [Op.ne]: "1" },
        },
        attributes: buildDuplicatePartyAttributes(Model),
        raw: true,
      });
      nameDuplicates = nameDuplicates.concat(details);
    }

    // Merge and dedupe results
    const allDuplicates = [...addressDuplicates, ...nameDuplicates];
    const uniqueDuplicates = allDuplicates.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.sno === item.sno),
    );

    return res.status(200).json({
      message: "Duplicate parties fetched successfully",
      data: uniqueDuplicates,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
      success: false,
    });
  }
};

/*
  Name : Sharan Patil
  Date Created : 11 Jan, 2025
  Description : Delete duplicate parties using soft delete.
*/
export const deleteDuplicateParty = async (req, res) => {
  try {
    // Destructure with aliases: snake_case from API → camelCase for internal use
    const {
      sno,
      contact_type: contactType,
      tableName,
      selected_lastname: selectedLastname,
    } = req.body;

    if (!sno || !Array.isArray(sno) || sno.length === 0) {
      return res.status(400).json({
        message: "Missing or invalid sno array",
        success: false,
      });
    }

    if (!contactType || !tableName || !selectedLastname) {
      return res.status(400).json({
        message:
          "Missing required parameters: contact_type, tableName, selected_lastname",
        success: false,
      });
    }

    const Model = getModelForTable(tableName);
    if (!Model) {
      return res.status(400).json({
        message: "Invalid table name",
        success: false,
      });
    }

    // Validate sno array - ensure all values are valid integers
    const sanitizedSno = sno.map((s) => {
      const parsed = parseInt(s, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid sno value");
      }
      return parsed;
    });

    // Use Sequelize update for soft delete
    const [affectedRows] = await Model.update(
      {
        isDeleted: "1",
        isActive: "0",
        modifiedDate: new Date(),
      },
      {
        where: {
          sno: { [Op.in]: sanitizedSno },
          typeOfContact: contactType,
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn("TRIM", Sequelize.col("Lastname")),
              selectedLastname,
            ),
          ],
        },
      },
    );

    return res.status(200).json({
      message: "1",
      success: true,
      affectedRows: affectedRows,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
      success: false,
    });
  }
};
