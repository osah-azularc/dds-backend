import { validateLocationFields } from "../../helpers/validation.js";
import { validationResult } from "express-validator";
import { Op } from "sequelize";
import {
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from "../constants/constant-messages.js";
import { insertModuleAuditLog } from "../helpers/auditLogs.helper.js";
import CourtLocations from "../models/CourtLocations.js";

const ALLOWED_ORDER_COLUMNS = {
  locationName: "locationName",
  status: "isActive",
};

// Strips leading/trailing spaces and collapses internal runs of whitespace to a single space
const normalizeWhitespace = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

/*
/*
		Name : Rahat
		Date Created : 29 Aug, 2025
		Description : Admin Settings, Hearing Location: Get all locations with pagination support.
	*/
export const getAllLocations = async (req, res) => {
  try {
    // Extract pagination parameters from query or body
    const {
      page = 0,
      pageSize = 10,
      search = "",
      orderby = "locationName",
      order = "asc",
      all = false,
    } = req.query.page !== undefined || req.query.all !== undefined
      ? req.query
      : req.body;

    // "all" skips pagination entirely (used by dropdowns that need every
    // record, e.g. Add/Edit Hearing Details) rather than being capped at
    // the 100-per-page limit below.
    const fetchAll = all === true || all === "true";

    // Convert to numbers and validate
    const pageNumber = Math.max(0, parseInt(page) || 0);
    const pageSizeNumber = Math.min(Math.max(1, parseInt(pageSize) || 10), 100); // Max 100 items per page
    const offset = pageNumber * pageSizeNumber;
    const orderDirection =
      order.toString().toUpperCase() === "DESC" ? "DESC" : "ASC";
    const orderColumn = ALLOWED_ORDER_COLUMNS[orderby] || "locationName";

    // Build where condition
    let whereCondition = {};

    // Add search condition if provided
    if (search && typeof search === "string" && search.trim()) {
      const searchTerm = search.trim();
      whereCondition = {
        locationName: {
          [Op.like]: `%${searchTerm}%`,
        },
      };
    }

    // Get total count for pagination info
    const totalCount = await CourtLocations.count({
      where: whereCondition,
    });

    // Get locations - all at once when fetchAll is set, otherwise paginated
    const locations = await CourtLocations.findAll({
      where: whereCondition,
      order: [[orderColumn, orderDirection]],
      ...(fetchAll ? {} : { limit: pageSizeNumber, offset }),
    });

    if (fetchAll) {
      return res.status(200).json({
        success: true,
        data: locations,
        pagination: {
          page: 0,
          pageSize: totalCount,
          totalCount,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        status: 200,
      });
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSizeNumber);
    const hasNextPage = pageNumber < totalPages - 1;
    const hasPreviousPage = pageNumber > 0;

    return res.status(200).json({
      success: true,
      data: locations,
      pagination: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
      data: [],
      status: 500,
    });
  }
};
/* 
		Name : Sharan Patil
		Date Created : 29 Aug, 2025
		Description : Admin Settings, Hearing Location: Get location by id.
	*/
export const getLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    // Validate locationId parameter
    if (!locationId || isNaN(locationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid location ID provided",
        status: 400,
      });
    }

    const location = await CourtLocationsfindOne({
      where: {
        is_deleted: "0",
        id: locationId,
      },
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: "Location not found",
        status: 404,
      });
    }

    return res.status(200).json({
      success: true,
      data: location,
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      status: 500,
    });
  }
};
/* 
		Name : Sharan Patil
		Date Created : 29 Aug, 2025
		Description : Admin Settings, Hearing Location: Create location API in the Admin Settings.
	*/
export const createLocation = async (req, res) => {
  const { body } = req;

  // Validate request body
  const validationErrors = validateLocationFields(body);
  if (validationErrors) {
    return res.status(400).json({ errors: validationErrors });
  }

  const {
    locationName,
    address1,
    address2,
    city,
    state,
    zip,
    firstName,
    lastName,
    email,
    phone,
    fax,
  } = req.body;

  const normalizedLocationName = normalizeWhitespace(locationName);

  // Check if location with same name already exists
  try {
    const existingLocation = await CourtLocations.findOne({
      where: {
        locationName: normalizedLocationName,
      },
    });

    if (existingLocation) {
      return res.status(409).json({
        success: false,
        error: "Location with this name already exists",
        message: `A location named "${normalizedLocationName}" already exists in the system`,
        status: 409,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Database error during validation",
      status: 500,
    });
  }

  try {
    const newLocation = await CourtLocations.create({
      locationName: normalizedLocationName,
      address1,
      address2,
      city,
      state,
      zip,
      fax,
      firstName: firstName,
      lastName: lastName,
      email,
      tel: phone,
      isActive: "1",
      createdBy: req.userId,
      modifiedBy: req.userId,
    });

    return res.status(200).json({
      success: true,
      data: newLocation,
      message: "Location created successfully",
      status: 200,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to create location",
      status: 500,
    });
  }
};
/* 
		Name : Sharan Patil
		Date Created : 29 Aug, 2025
		Description : Admin Settings, Update Existing CourtLocations
	*/
export const updateLocation = async (req, res) => {
  const LocationId = req.params.id;
  const {
    locationName,
    address1,
    address2,
    city,
    state,
    zip,
    isActive,
    instructions,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    fax,
  } = req.body;

  // Strip formatting: keep digits only for phone/fax; strip dash for zip
  const cleanPhone = phone ? phone.replace(/\D/g, "") : phone;
  const cleanFax = fax ? fax.replace(/\D/g, "") : fax;
  const cleanZip = zip ? zip.replace(/-/g, "") : zip;

  const validationErrors = validateLocationFields(req.body);
  if (validationErrors) {
    return res.status(400).json({ errors: validationErrors });
  }

  try {
    const updateData = {
      locationName: normalizeWhitespace(locationName),
      address1,
      address2,
      city,
      state,
      zip: cleanZip,
      tel: cleanPhone,
      instructions,
      isActive,
      firstName,
      middleName,
      lastName,
      email,
      fax: cleanFax,
      created_by: req.userId,
      modified_by: req.userId,
    };

    const updatedLocation = await CourtLocations.update(updateData, {
      where: { courtlocationid: LocationId },
    });

    return res
      .status(200)
      .json({ success: true, data: updatedLocation, status: 200 });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", data: [], status: 500 });
  }
};

export const deleteLocation = async (req, res) => {
  try {
    const updatedLocation = await CourtLocationsupdate(
      { is_deleted },
      { where: { id: LocationId } },
    );
    return res
      .status(200)
      .json({ success: true, data: updatedLocation, status: 200 });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", data: [], status: 500 });
  }
};
