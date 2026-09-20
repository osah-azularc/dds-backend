import { Op } from "sequelize";
import { Docket } from "../../models/index.js";
import { getStaticDataWithCache } from "./agingReportsCache.js";
import { buildAgingReportsWhereConditions } from "./aging/agingReportsWhereBuilder.js";
import { fetchAgingReportsDetails, buildPaginationMetadata } from "./aging/agingReportsDetailsView.js";
import { fetchAgingReportsDashboard } from "./aging/agingReportsDashboardView.js";
import { logger } from "../../../config/winstonLogger.js";

// Re-export clearStaticDataCache for backward compatibility using ES module re-export
export { clearStaticDataCache } from "./agingReportsCache.js";

/**
 * Get aging reports data
 * @param {Object} param - Filter parameters
 * @param {string} type - Report type: 'open-cases', 'sop', 'no-hearing-date', 'no-decision', 'decision', 'no-noh'
 * @returns {Object} Object containing count and data arrays
 */
export async function agingReports(param, type) {
  try {
    // Fetch casetype_restriction and holidays data with caching
    const { casetypeRestrictionData, holidaysData } = await getStaticDataWithCache();

    // Build where conditions using extracted helper
    const whereConditions = buildAgingReportsWhereConditions(
      param,
      type,
      casetypeRestrictionData,
      holidaysData
    );

    // Extract view parameters
    const view = param.view || {};
    const detailsView = view.detailsView;
    const exportMode = view.exportMode;
    const exportDashboard = view.exportDashboard;

    // Get count
    const countResult = await Docket.count({
      where: whereConditions.length ? { [Op.and]: whereConditions } : undefined,
      logging: false,
    });

    // Build result object with count
    const typeMap = {
      'open-cases': 'openCasesCount',
      'sop': 'SOPCount',
      'no-hearing-date': 'noHearingDateCount',
      'no-decision': 'noDecisionCount',
      'decision': 'DecisionCount',
      'no-noh': 'noNohCount'
    };

    const result = {
      [typeMap[type]]: countResult
    };

    // Handle details view
    if (detailsView) {
      // ✅ Pass exportMode flag to fetch all records when exporting details view
      const detailsData = await fetchAgingReportsDetails(whereConditions, detailsView, exportMode);
      result.details = detailsData;

      // Only build pagination metadata for non-export mode
      if (!exportMode) {
        result.pagination = buildPaginationMetadata(countResult, detailsView);
      }
    } else if (exportMode) {
      // Handle export mode (dashboard export without detailsView)
      const exportData = await fetchAgingReportsDetails(whereConditions, detailsView, true);
      result.exportData = exportData;
    } else {
      // Handle dashboard view
      const view2Selected = view.view2Selected || 'judges';
      const dashboardData = await fetchAgingReportsDashboard(
        whereConditions,
        view2Selected,
        exportDashboard
      );

      result.data = dashboardData.data;
      result.agencyCasetypeDropdown = dashboardData.agencyCasetypeDropdown;

      if (exportDashboard) {
        result.exportDashboard = dashboardData.exportDashboard;
      }
    }

    return result;
  } catch (error) {
    logger.error(`Error in agingReports helper (${type}):`, error);
    throw error;
  }
}

