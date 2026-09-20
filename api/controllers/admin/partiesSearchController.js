import TypeOfContact from "../../models/TypeOfContact.js";
import AgencyCaseworkerByCaseMaster from "../../models/admin/agencyCaseworkerByCaseMasterModel.js";
import AttorneyByCaseMaster from "../../models/admin/attorneyByCaseMasterModel.js";
import { Op } from "sequelize";

// Maps the DataGrid column field (frontend) to the Sequelize attribute name
// (backend) used to sort each party table.
const SORT_FIELD_MAP = {
  lastName: "lastName",
  firstName: "firstName",
  contactType: "typeOfContact",
  address: "address1",
  createdDate: "createdDate",
  modifiedDate: "modifiedDate",
  status: "isActive",
};

const compareSortValues = (va, vb) => {
  if (va == null && vb == null) return 0;
  if (va == null) return -1;
  if (vb == null) return 1;
  if (va instanceof Date && vb instanceof Date)
    return va.getTime() - vb.getTime();
  if (typeof va === "string" && typeof vb === "string")
    return va.localeCompare(vb);
  if (va < vb) return -1;
  if (va > vb) return 1;
  return 0;
};

// Sorts an already-transformed party array by a mapped sort field/direction.
// Used for the "search both tables" case, where results from two separate
// tables are merged and can't be ordered by a single SQL ORDER BY.
const sortParties = (parties, sortField, sortDirection) => {
  const sorted = [...parties].sort((a, b) =>
    compareSortValues(a[sortField], b[sortField]),
  );
  return sortDirection === "DESC" ? sorted.reverse() : sorted;
};

/*
  Name : Sharan Patil
  Date Created : 01 Sep, 2025
  Description : Parties Master - Search parties based on search criteria
*/
export const searchParties = async (req, res) => {
  try {
    const {
      contactType = "",
      lastName = "",
      firstName = "",
      page = 0,
      pageSize = 10,
      sortBy = "",
      sortOrder = "asc",
    } = req.body || {};

    const pageNumber = Math.max(0, parseInt(page) || 0);
    const pageSizeNumber = Math.min(Math.max(1, parseInt(pageSize) || 10), 100);
    const offset = pageNumber * pageSizeNumber;

    const sortField = SORT_FIELD_MAP[sortBy];
    const sortDirection = sortOrder === "desc" ? "DESC" : "ASC";

    let condition = {};
    if (lastName !== "") condition.lastName = { [Op.like]: `%${lastName}%` };
    if (firstName !== "") condition.firstName = { [Op.like]: `%${firstName}%` };

    const transformParty = (party) => {
      const { typeOfContact, ...otherFields } = party.dataValues;
      return { ...otherFields, contactType: typeOfContact };
    };

    let result = [];
    let totalCount = 0;

    if (contactType === "") {
      // Search both tables
      const agencyWhere = { ...condition };
      const attorneyWhere = { ...condition };

      const [count1, count2] = await Promise.all([
        AgencyCaseworkerByCaseMaster.count({ where: agencyWhere }),
        AttorneyByCaseMaster.count({ where: attorneyWhere }),
      ]);

      totalCount = count1 + count2;

      if (offset >= totalCount) {
        result = [];
      } else if (sortField) {
        // Sorting spans both tables, so fetch every matching row from each,
        // merge, sort in JS, then slice the requested page out of the merged set.
        const [agencyRows, attorneyRows] = await Promise.all([
          AgencyCaseworkerByCaseMaster.findAll({ where: agencyWhere }),
          AttorneyByCaseMaster.findAll({ where: attorneyWhere }),
        ]);

        const combined = [
          ...agencyRows.map(transformParty),
          ...attorneyRows.map(transformParty),
        ];
        result = sortParties(combined, sortField, sortDirection).slice(
          offset,
          offset + pageSizeNumber,
        );
      } else if (offset >= count1) {
        const rows = await AttorneyByCaseMaster.findAll({
          where: attorneyWhere,
          limit: pageSizeNumber,
          offset: offset - count1,
        });
        result = rows.map(transformParty);
      } else if (offset + pageSizeNumber <= count1) {
        const rows = await AgencyCaseworkerByCaseMaster.findAll({
          where: agencyWhere,
          limit: pageSizeNumber,
          offset,
        });
        result = rows.map(transformParty);
      } else {
        const fromTable1 = count1 - offset;
        const fromTable2 = pageSizeNumber - fromTable1;

        const [rows1, rows2] = await Promise.all([
          AgencyCaseworkerByCaseMaster.findAll({
            where: agencyWhere,
            limit: fromTable1,
            offset,
          }),
          AttorneyByCaseMaster.findAll({
            where: attorneyWhere,
            limit: fromTable2,
            offset: 0,
          }),
        ]);

        result = [...rows1.map(transformParty), ...rows2.map(transformParty)];
      }
    } else {
      // Contact type specific search — contactType is the TypeOfContact name
      // (matched by name, not id, since contacttypeid is not populated on legacy rows)
      const contactTypeRecord = await TypeOfContact.findOne({
        where: { partyContact: contactType },
      });

      if (!contactTypeRecord) {
        return res.status(404).json({
          message: "Contact type not found",
          success: false,
        });
      }

      const tablename = contactTypeRecord.tableName;
      condition.typeOfContact = contactTypeRecord.partyContact;

      const singleTableWhere = { ...condition };

      const order = sortField ? [[sortField, sortDirection]] : undefined;

      switch (tablename) {
        case "attorneybycase": {
          totalCount = await AttorneyByCaseMaster.count({
            where: singleTableWhere,
          });
          const rows = await AttorneyByCaseMaster.findAll({
            where: singleTableWhere,
            limit: pageSizeNumber,
            offset,
            order,
          });
          result = rows.map(transformParty);
          break;
        }
        case "agencycaseworkerbycase": {
          totalCount = await AgencyCaseworkerByCaseMaster.count({
            where: singleTableWhere,
          });
          const rows = await AgencyCaseworkerByCaseMaster.findAll({
            where: singleTableWhere,
            limit: pageSizeNumber,
            offset,
            order,
          });
          result = rows.map(transformParty);
          break;
        }
        default:
          return res
            .status(200)
            .json({ message: "No results", data: [], success: true });
      }
    }

    const totalPages = Math.ceil(totalCount / pageSizeNumber);

    return res.status(200).json({
      data: result,
      pagination: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages - 1,
        hasPreviousPage: pageNumber > 0,
      },
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
      success: false,
    });
  }
};
