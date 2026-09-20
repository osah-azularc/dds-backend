import { getDocketHistoryData } from '../../helpers/docketDetail/docketHistoryHelper.js';
import { logger } from "../../../config/winstonLogger.js";

export async function getHistoryData(req, res) {
  try {
    const {
      docketId,
      page = 0,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc',
    } = req.body;

    const historyData = await getDocketHistoryData({ docketId, page, limit, sortBy, sortOrder });

    return res.status(200).json({
      success: true,
      message: historyData.data.length > 0 ? 'History data fetched successfully' : 'No history data found',
      data: {
        result: historyData.data,
        pagination: historyData.pagination,
      },
      count: historyData.pagination.total,
      error: null,
    });
  } catch (error) {
    logger.error('Error in getHistoryData:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      data: {
        result: [],
        pagination: {
          total: 0,
          page: 0,
          limit: 10,
          totalPages: 0,
        },
      },
      count: 0,
      error: error.message,
    });
  }
}