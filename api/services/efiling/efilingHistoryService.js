import { Sequelize, Op } from "sequelize";
import EfilingHistory from "../../models/EfilingHistory.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";

/**
 * E-Filing History Service
 * Handles history-related operations
 */
class EfilingHistoryService {
  /**
   * Fetch history with pagination and search
   */
  async getHistory({ page = 1, limit = 10, searchValue = "", sortField = "created_date", sortOrder = "DESC", userId }) {
    const offset = (page - 1) * limit;

    const whereCondition = {
      createdBy: userId,
    };

    if (searchValue && searchValue.trim() !== "") {
      whereCondition[Op.or] = [
        { description: { [Op.like]: `%${searchValue}%` } },
      ];
    }

    // Map frontend sort fields to backend database columns (similar to ePortal's sortFieldMap)
    const sortFieldMap = {
      'created_date': 'created_date',
      'created_time': 'created_date',
      'description': 'description',
      'modifier_name': 'createdBy',
    };

    const dbSortField = sortFieldMap[sortField] || 'created_date';
    
    // Build order array - use literal to reference the raw column for sorting
    const order = [[Sequelize.literal(`\`EfilingHistory\`.\`${dbSortField}\``), sortOrder.toUpperCase()]];

    const totalHistoryCount = await EfilingHistory.count({
      where: whereCondition,
    });

    const historyRecords = await EfilingHistory.findAll({
      where: whereCondition,
      attributes: [
        "id",
        "created_date", // Include raw column for sorting
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("EfilingHistory.created_date"), "%m-%d-%Y"), "formatted_date"],
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("EfilingHistory.created_date"), "%h:%i %p"), "formatted_time"],
        "description",
        "createdBy",
      ],
      include: [
        {
          model: JudgeAssistantClerk,
          as: "JudgeAssistantClerk",
          attributes: ["FirstName", "LastName"],
          required: false,
        },
      ],
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: false,
    });

    const formattedHistoryRecords = historyRecords.map((historyItem) => {
      const historyData = historyItem.toJSON();
      return {
        id: historyData.id,
        created_date: historyData.formatted_date,
        created_time: historyData.formatted_time,
        description: historyData.description,
        created_by: historyData.createdBy,
        modifier_name: historyData.JudgeAssistantClerk
          ? `${historyData.JudgeAssistantClerk.LastName || ""}, ${historyData.JudgeAssistantClerk.FirstName || ""}`.trim()
          : "",
      };
    });

    return {
      history: formattedHistoryRecords,
      pagination: {
        total: totalHistoryCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalHistoryCount / limit),
      },
    };
  }
}

export default new EfilingHistoryService();
