import { getRejectedPendingDocumentsHelper } from "../../helpers/docketDetail/pendingRejectedDocumentsHelper.js"
import { logger } from "../../../config/winstonLogger.js";

/** 
    Created by  : Snehal Narkar
    Date        : 21-04-2026 
    Description : Fetches rejected/pending external documents for a specific docket/case
                  with reports-style pagination and sorting support.
    Parameters  : 
        - req : Express request object containing body parameters
            - docketId (Number): Docket/case ID to fetch documents for
            - page (Number): 0-based page number
            - limit (Number): records per page
            - sortBy (String): sortable field name
            - sortOrder (String): asc or desc
        - res : Express response object for sending the result 
 
    Response    : Returns JSON with success status, paginated result set,
                  and pagination metadata in reports format.
*/
export const getRejectedPendingDocuments = async (req, res) => {
  try {
    const {
      docketId,
      page = 0,
      limit = 20,
      sortBy,
      sortOrder = 'desc',
    } = req.body;

    const caseId = Number(docketId);

    if (!caseId || Number.isNaN(caseId) || caseId <= 0) {
      return res.status(400).json({
        status: 400,
        message: "Invalid docket ID format",
        success: false,
      });
    }

    const result = await getRejectedPendingDocumentsHelper({
      caseId,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    return res.status(200).json({
      status: 200,
      message: result.data.length
        ? "Rejected/pending documents fetched successfully"
        : "No rejected/pending documents found",
      success: true,
      data: {
        result: result.data,
        pagination: result.pagination,
      },
      error: null,
    });
  } catch (error) {
    logger.error("Error fetching rejected/pending documents:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      message: "Failed to fetch rejected/pending documents",
      success: false,
    });
  }
};
