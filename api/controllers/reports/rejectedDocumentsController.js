import { getRejectedDocuments } from "../../helpers/reports/rejectedDocumentsHelper.js";
import { validateRejectedDocuments } from "../../helpers/reportValidators.js";
import { handleApiError } from "./shared/controllerUtils.js";

/*
    Created by  : Snehal Narkar
    Date        : 2026-01-05
    Updated     : 2026-01-08 (Added pagination support)
    Description : Function is used to fetch rejected document reports with various filters and pagination
    Parameters  :
        - req : Express request object containing filter parameters in body
            - reportType (String): 'agency' or 'ecourt' (default)
            - agency (Array): Reference agency filter
            - casetypes (Array): Case type filter
            - platform (Array): Platform filter
            - judge (Array): Judge filter (ecourt only)
            - judgeassistant (Array): Judge assistant filter (ecourt only)
            - dateReceivedFrom (String): Start date filter (MM-DD-YYYY)
            - dateReceivedTo (String): End date filter (MM-DD-YYYY)
            - page (Number): Page number (0-based, default: 0)
            - limit (Number): Records per page (default: 100, max: 1000)
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, data array, pagination metadata, and error
*/
export const getRejectedDocumentsReports = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Validate input using Joi schema
    const filters = validateRejectedDocuments(param);

    const result = await getRejectedDocuments(filters);

    return res.status(200).json({
      success: true,
      message: result?.data && result.data.length > 0
        ? "Rejected document reports fetched successfully."
        : "No rejected document reports found.",
      data: {
        result: result.data,
        pagination: result.pagination,
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(res, error, "getRejectedDocumentsReports controller");
  }
};


