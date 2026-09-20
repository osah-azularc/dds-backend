import { mysqlSequelize } from "../../../connections/seqDB.js";
import Agency from "../../models/admin/agencyModel.js";
import Casetypes from "../../models/Casetypes.js";
import { Op } from "sequelize";

// Maps the AgencyTab.jsx grid's column fields to the Sequelize model's
// attribute names, so req.body.sortBy can't be used to order by an
// arbitrary/unmapped column.
const SORTABLE_FIELDS = {
  agencyCode: "agencyCode",
  isActive: "isActive",
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Fetches agency records, optionally filtered by search term, sorted, and paginated.
*/

export const getAgency = async (req, res) => {
  const { agency_search, page, pageSize, sortBy, sortOrder } = req.body;
  try {
    const sortField = SORTABLE_FIELDS[sortBy] || "agencyCode";
    const sortDirection = String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";

    let whereClause = {};

    // Add search functionality
    if (agency_search && agency_search.trim() !== "") {
      whereClause = {
        [Op.or]: [{ Agencycode: { [Op.like]: `%${agency_search}%` } }],
      };
    }

    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);
    const isPaginated = pageNum > 0 && pageSizeNum > 0;

    if (isPaginated) {
      const { rows, count } = await Agency.findAndCountAll({
        where: whereClause,
        order: [[sortField, sortDirection]],
        limit: pageSizeNum,
        offset: (pageNum - 1) * pageSizeNum,
      });
      return res.status(200).json({
        status: 200,
        message: "Agency data fetched successfully",
        data: rows,
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
        success: true,
      });
    }

    const agencies = await Agency.findAll({
      where: whereClause,
      order: [[sortField, sortDirection]],
    });
    return res.status(200).json({
      status: 200,
      message: "Agency data fetched successfully",
      data: agencies,
      success: true,
    });
  } catch (error) {
    console.error("Error in getAgency:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch agency data",
      message: "Agency data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name : Rahat Pasha
  Date Created : 25 Jul, 2026
  Description : Creates a new agency or updates an existing one (status: 0 = create, 1 = update).
*/

export const adminAgencyAddEdit = async (req, res) => {
  const { status, data } = req.body;
  try {
    const agencyCode = data?.Agencycode;
    if (agencyCode) {
      const duplicateWhere = { agencyCode };
      if (Number(status) === 1 && data?.AgencyID) {
        duplicateWhere.agencyId = { [Op.ne]: data.AgencyID };
      }

      const existingAgency = await Agency.findOne({ where: duplicateWhere });

      if (existingAgency) {
        return res.status(400).json({
          status: 400,
          title: "Unable to save agency",
          message: "Agency code already exists.",
          success: false,
        });
      }
    }

    const agencyFields = {
      agencyCode,
      agencyDescription: data?.Agencydescription,
      firstName: data?.firstname,
      lastName: data?.lastname,
      middleName: data?.middlename,
      address1: data?.address1,
      address2: data?.address2,
      city: data?.city,
      state: data?.state,
      zip: data?.zip,
      phone: data?.phone,
      email: data?.email,
      fax: data?.fax,
    };

    if (Number(status) === 1) {
      if (!data?.AgencyID) {
        return res.status(400).json({
          status: 400,
          title: "Unable to update agency",
          message: "AgencyID is required to update an agency.",
          success: false,
        });
      }

      await Agency.update(
        { ...agencyFields, modifiedDate: new Date() },
        { where: { agencyId: data.AgencyID } },
      );

      return res.status(200).json({
        status: 200,
        message: "Agency updated successfully",
        success: true,
      });
    }

    await Agency.create({
      ...agencyFields,
      isActive: "1",
      createdDate: new Date(),
    });

    return res.status(200).json({
      status: 200,
      message: "Agency created successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error in adminAgencyAddEdit:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to save agency",
      message: "The agency could not be saved at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Activates or deactivates an agency by updating its active status flag.
  Cascades the same status to all case types tied to the agency, since the
  confirm dialog shown before this call warns the admin those case types
  will be flipped along with it.
*/

export const updateAgencyStatus = async (req, res) => {
  const { id, is_active } = req.body;
  try {
    if (id && id > 0) {
      const transaction = await mysqlSequelize.transaction();
      try {
        const updatedAgencyStatus = await Agency.update(
          { isActive: is_active, modifiedDate: new Date() },
          { where: { AgencyID: id }, transaction },
        );

        await Casetypes.update(
          { isActive: is_active, modifiedDate: new Date() },
          { where: { agencyId: id }, transaction },
        );

        await transaction.commit();

        let message = "deactivated";
        if (is_active == "1") {
          message = "restored for use";
        }

        return res.status(200).json({
          status: 200,
          message: "Agency successfully " + message,
          data: updatedAgencyStatus,
          success: true,
        });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      let title = "deactivate agency";
      let message =
        "The agency could not be deactivated at this time. Please try again.";
      if (is_active == "1") {
        title = "restore Agency for use";
        message =
          "The agency could not be restored for use at this time. Please try again.";
      }
      return res.status(200).json({
        status: 400,
        title: "Unable to " + title,
        message: message,
        success: false,
      });
    }
  } catch (error) {
    console.error("Error in updateAgencyStatus:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to update agency status",
      message:
        "The agency could not be update the status at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name : Rahat Pasha
  Date Created : 26 Jul, 2026
  Description : Fetches the case type codes tied to an agency, used to warn admins which case types will be activated/deactivated along with the agency before the status toggle is confirmed.
*/

export const getAgencyCaseTypes = async (req, res) => {
  const { id } = req.body;
  try {
    const casetypes = await Casetypes.findAll({
      where: { agencyId: id },
      attributes: ["caseCode"],
    });

    return res.status(200).json({
      status: 200,
      message: "Agency case types fetched successfully",
      data: casetypes,
      success: true,
    });
  } catch (error) {
    console.error("Error in getAgencyCaseTypes:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch agency case types",
      message:
        "Agency case types could not be fetched at this time. Please try again.",
      success: false,
    });
  }
};
