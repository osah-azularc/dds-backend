import Casetypes from "../../models/Casetypes.js";
import CasteTypeGroups from "../../models/admin/casteTypeGroupsModel.js";
import CaseTypeStyling from "../../models/admin/caseTypeStylingModel.js";
import HearingDateSkip from "../../models/admin/hearingDateSkipModel.js";
import UnifiedCases from "../../models/admin/unified_casesModel.js";
import AdminHistory from "../../models/admin/adminHistoryModel.js";
import { Op } from "sequelize";
import { successResponse, failureResponse } from "../../../helpers/helper.js";

// The CaseTypeTab.jsx grid and edit form read rows by the legacy DB column
// names (Casetypeid, AgencyID, CaseCode, ...), so translate the model's
// camelCase attributes back to that shape in JS rather than via Sequelize's
// attribute-alias array, which doesn't apply field mapping (see Casetypes.js
// field: definitions) and silently mis-selects columns like isActive/is_active.
const toLegacyCaseTypeRow = (row) => ({
  Casetypeid: row.caseTypeId,
  AgencyID: row.agencyId,
  CaseCode: row.caseCode,
  Casefiletype: row.caseFileType,
  CaseDescription: row.caseDescription,
  SOP: row.sop,
  Active: row.active,
  Agencycode: row.agencyCode,
  is_active: row.isActive,
  created_by: row.createdBy,
  modified_by: row.modifiedBy,
  created_date: row.createdDate,
  modified_date: row.modifiedDate,
});

// Maps the CaseTypeTab.jsx grid's column fields (legacy DB column names) to
// the Sequelize model's camelCase attribute names, so req.body.sortBy can't
// be used to order by an arbitrary/unmapped column.
const SORTABLE_FIELDS = {
  CaseCode: "caseCode",
  Agencycode: "agencyCode",
  is_active: "isActive",
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Fetches case types with optional search, agency filtering, and pagination support.
*/
export const getCaseTypes = async (req, res) => {
  const { casetype_search, agencyCode, page, pageSize, sortBy, sortOrder } =
    req.body;

  try {
    const sortField = SORTABLE_FIELDS[sortBy] || "caseCode";
    const sortDirection =
      String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";

    const whereClause = {};

    // Filter by exact agencyCode if provided (for Document Template V2 cascading dropdown)
    if (agencyCode && agencyCode.trim() !== "") {
      whereClause.agencyCode = agencyCode.trim();
    }
    // Add search filter if provided (legacy behavior)
    if (casetype_search && casetype_search.trim() !== "") {
      const searchTerm = `%${casetype_search}%`;
      whereClause[Op.or] = [
        { caseCode: { [Op.like]: searchTerm } },
        // { caseDescription: { [Op.like]: searchTerm } },
        // { agencyCode: { [Op.like]: searchTerm } },
      ];
    }

    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);
    const isPaginated = pageNum > 0 && pageSizeNum > 0;

    if (isPaginated) {
      const { rows: casetypes, count: total } = await Casetypes.findAndCountAll(
        {
          where: whereClause,
          order: [[sortField, sortDirection]],
          limit: pageSizeNum,
          offset: (pageNum - 1) * pageSizeNum,
          raw: true,
        },
      );

      // Pagination metadata (total/page/pageSize) doesn't fit successResponse's shape, so build the response directly.
      return res.status(200).json({
        success: true,
        message: "Case types data fetched successfully",
        data: casetypes.map(toLegacyCaseTypeRow),
        status: 200,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    }

    const casetypes = await Casetypes.findAll({
      where: whereClause,
      order: [[sortField, sortDirection]],
      raw: true,
    });

    return successResponse(
      res,
      "Case types data fetched successfully",
      casetypes.map(toLegacyCaseTypeRow),
      200,
    );
  } catch (error) {
    console.error("Error in getCaseTypes:", error);
    return failureResponse(
      res,
      "Unable to fetch case types data",
      500,
      "Case types data is unable to fetch at this time. Please try again.",
    );
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Fetches the available case type group records for dropdown usage.
*/
export const getCaseTypeGroups = async (req, res) => {
  try {
    const casetypegroups = await CasteTypeGroups.findAll({
      attributes: ["id", "casetypegroup"],
      order: [["casetypegroup", "ASC"]],
    });

    return successResponse(
      res,
      "Case type groups data fetched successfully",
      casetypegroups,
      200,
    );
  } catch (error) {
    console.error("Error in getCaseTypeGroups:", error);
    return failureResponse(
      res,
      "Unable to fetch case type groups data",
      500,
      "Case type groups data is unable to fetch at this time. Please try again.",
    );
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Fetches case type styling configuration data for the admin interface.
*/
export const getCaseTypeStyling = async (req, res) => {
  try {
    // Fetch only the required columns from the CaseTypeStyling table
    // and order by `id` to provide a stable result ordering for the UI.
    const caseTypeStylingData = await CaseTypeStyling.findAll({
      attributes: [
        "id",
        "agencyId",
        "caseTypeId",
        "petitioner",
        "respondent",
        "fileType",
      ],
      order: [["id", "ASC"]],
    });

    return successResponse(
      res,
      "Case type styling data fetched successfully",
      caseTypeStylingData,
      200,
    );
  } catch (error) {
    console.error("Error in getCaseTypeStyling:", error);
    return failureResponse(
      res,
      "Unable to fetch case type styling data",
      500,
      "Case type styling data is unable to fetch at this time. Please try again.",
    );
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Updates an existing case type along with styling, hearing skip, and group association data.
*/
export const updateCasetypedata = async (req, res) => {
  try {
    const {
      casetypeId,
      casetypeData,
      casetypegroupData,
      casetypestylingData,
      hearingdateskipFlag,
    } = req.body;

    // Get current timestamp
    const currentDateTime = new Date();

    // Step 1: Verify case type exists
    const existingCasetype = await Casetypes.findByPk(casetypeId);
    if (!existingCasetype) {
      return failureResponse(res, "Case type not found", 404);
    }

    // Step 2: Check for duplicate case type (excluding current record)
    const duplicateCasetype = await Casetypes.findOne({
      where: {
        CaseCode: casetypeData.CaseCode,
        Agencycode: casetypeData.agencyCode,
        Casetypeid: { [Op.ne]: casetypeId },
      },
    });

    if (duplicateCasetype) {
      return res.status(200).json({
        status: 409,
        message: "Casetype already exists",
        success: false,
      });
    }

    // Step 3: Update case type data
    const caseTypeWithMetadata = {
      ...casetypeData,
      modifiedBy: req.userId || 1,
      modifiedDate: currentDateTime,
    };

    await Casetypes.update(caseTypeWithMetadata, {
      where: { Casetypeid: casetypeId },
    });

    // Step 4: Update case type styling data
    await CaseTypeStyling.update(casetypestylingData, {
      where: { caseTypeId: casetypeId },
    });

    // Step 5: Update hearing date skip
    const existingHearingSkip = await HearingDateSkip.findOne({
      where: { caseTypeId: casetypeId },
    });

    if (hearingdateskipFlag === "1") {
      if (!existingHearingSkip) {
        await HearingDateSkip.create({ caseTypeId: casetypeId });
      }
    } else {
      if (existingHearingSkip) {
        await HearingDateSkip.destroy({
          where: { caseTypeId: casetypeId },
        });
      }
    }

    // Step 6: Update unified cases (case type groups)
    if (casetypegroupData && Array.isArray(casetypegroupData)) {
      // Delete existing unified cases for this case type
      await UnifiedCases.destroy({
        where: { casetypeid: casetypeId },
      });

      // Create new unified cases for selected groups
      if (casetypegroupData.length > 0) {
        const caseTypeGroups = await CasteTypeGroups.findAll({
          where: { id: casetypegroupData },
          attributes: ["id", "casetypegroup"],
        });
        for (const group of caseTypeGroups) {
          await UnifiedCases.create({
            casetypeid: casetypeId,
            casetype_group_id: group.id,
            casetypegroup: group.casetypegroup,
          });
        }
      }
    }

    // Step 7: Log to admin history
    await AdminHistory.create({
      new_values: JSON.stringify({
        casetypeData,
        casetypegroupData,
        casetypestylingData,
        hearingdateskipFlag,
      }),
      modified_by: req.userId || 1,
      module_name: "casetype/hearingdateskip/unified_cases/casetypestylingData",
      action_name: "update",
      modified_date: currentDateTime,
    });

    // Step 8: Return success response
    return successResponse(
      res,
      "Case type data updated successfully",
      { casetypeid: casetypeId },
      200,
    );
  } catch (error) {
    console.error("Error in updateCasetypedata:", error);
    return failureResponse(
      res,
      "Unable to update case type data. Please try again.",
      500,
    );
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Fetches the styling and group assignments for a single case type (used to pre-populate the edit form).
*/
export const getCaseTypeDetails = async (req, res) => {
  const { casetypeId } = req.body;
  try {
    const [groups, styling, hearingDateSkip] = await Promise.all([
      UnifiedCases.findAll({
        where: { casetypeid: casetypeId },
        attributes: ["casetype_group_id", "casetypegroup"],
      }),
      CaseTypeStyling.findOne({
        where: { caseTypeId: casetypeId },
        attributes: ["petitioner", "respondent", "fileType"],
      }),
      HearingDateSkip.findOne({
        where: { caseTypeId: casetypeId },
      }),
    ]);

    return successResponse(
      res,
      "Case type details fetched successfully",
      {
        groupIds: groups.map((g) => g.casetype_group_id).filter(Boolean),
        styling: styling || null,
        hearingdateskipFlag: hearingDateSkip ? "1" : "",
      },
      200,
    );
  } catch (error) {
    console.error("Error in getCaseTypeDetails:", error);
    return failureResponse(
      res,
      "Unable to fetch case type details",
      500,
      "Case type details are unable to fetch at this time. Please try again.",
    );
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Activates or deactivates a case type by updating its active status flag.
*/
export const updateCaseTypeStatus = async (req, res) => {
  const { id, is_active } = req.body;
  const user_id = req.userId;
  try {
    if (id && id > 0) {
      const updatedCaseTypeStatus = await Casetypes.update(
        { isActive: is_active, modifiedBy: user_id, modifiedDate: new Date() },
        { where: { Casetypeid: id } },
      );

      let message = "deactivated";
      if (is_active == "1") {
        message = "restored for use";
      }

      return res.status(200).json({
        status: 200,
        message: "Case type successfully " + message,
        data: updatedCaseTypeStatus,
        success: true,
      });
    } else {
      let title = "deactivate case type";
      let message =
        "The case type could not be deactivated at this time. Please try again.";
      if (is_active == "1") {
        title = "restore case type for use";
        message =
          "The case type could not be restored for use at this time. Please try again.";
      }
      return res.status(200).json({
        status: 400,
        title: "Unable to " + title,
        message: message,
        success: false,
      });
    }
  } catch (error) {
    console.error("Error in updateCaseTypeStatus:", error);
    return res.status(500).json({
      status: 500,
      title: "Unable to update case type status",
      message:
        "The case type could not update the status at this time. Please try again.",
      success: false,
    });
  }
};

/*
  Name : Rahat Pasha
  Date Created : 01 Jul, 2026
  Description : Creates a new case type with styling, hearing skip, and group association details.
*/
export const addCasetypedata = async (req, res) => {
  try {
    const {
      casetypeData,
      casetypegroupData,
      casetypestylingData,
      hearingdateskipFlag,
    } = req.body;

    const currentDateTime = new Date();

    // Check duplicate
    const duplicateCasetype = await Casetypes.findOne({
      where: {
        caseCode: casetypeData.caseCode,
        agencyCode: casetypeData.agencyCode,
      },
    });

    if (duplicateCasetype) {
      return failureResponse(res, "Casetype already exists", 409);
    }

    // Create case type
    const caseTypeWithMetadata = {
      agencyId: casetypeData.agencyId,
      agencyCode: casetypeData.agencyCode,
      caseCode: casetypeData.caseCode,
      caseDescription: casetypeData.caseDescription,
      caseFileType: casetypeData.caseFileType,
      sop: casetypeData.SOP,
      isActive: casetypeData.isActive ?? "1",
      active: casetypeData.active ?? "1",
      createdBy: req.userId,
      modifiedBy: req.userId,
      createdDate: currentDateTime,
      modifiedDate: currentDateTime,
    };

    const newCasetype = await Casetypes.create(caseTypeWithMetadata);

    const caseTypeId = newCasetype.caseTypeId;

    // Create styling
    const caseTypeStylingWithId = {
      ...casetypestylingData,
      caseTypeId,
      agencyId: casetypeData.agencyId,
    };

    await CaseTypeStyling.create(caseTypeStylingWithId);

    // Hearing date skip
    if (hearingdateskipFlag === "1") {
      await HearingDateSkip.create({
        caseTypeId: caseTypeId,
      });
    }

    // Unified cases
    if (Array.isArray(casetypegroupData) && casetypegroupData.length > 0) {
      const groups = await CasteTypeGroups.findAll({
        where: {
          id: casetypegroupData,
        },
        attributes: ["id", "casetypegroup"],
      });

      for (const group of groups) {
        await UnifiedCases.create({
          casetypeid: caseTypeId,
          casetype_group_id: group.id,
          casetypegroup: group.casetypegroup,
        });
      }
    }

    // Audit
    await AdminHistory.create({
      new_values: JSON.stringify({
        casetypeData,
        casetypegroupData,
        casetypestylingData,
        hearingdateskipFlag,
      }),
      modified_by: req.userId,
      module_name: "casetype/hearingdateskip/unified_cases/casetypestylingData",
      action_name: "add",
      modified_date: currentDateTime,
    });

    return successResponse(
      res,
      "Case type data added successfully",
      {
        caseTypeId,
      },
      200,
    );
  } catch (error) {
    console.error("Error in addCasetypedata:", error);
    return failureResponse(
      res,
      "Unable to add case type data. Please try again.",
      500,
    );
  }
};
