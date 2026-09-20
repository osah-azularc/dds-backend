import homeService from '../../services/dashboard/homeService.js';
import { logger } from "../../../config/winstonLogger.js";

/**
 * Get open cases with decision document for CMA dashboard
 * @route POST /api/dashboard/open-cases-with-decision
 */
export const getOpenCasesWithDecision = async (req, res) => {
  try {
    const userId = req.userId;
    const { seeAll } = req.body;
    const result = await homeService.getOpenCasesWithDecision(userId, seeAll);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching open cases with decision:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get upcoming calendars for user dashboard
 * @route POST /api/dashboard/upcoming-calendars
 */
export const getUpcomingCalendars = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await homeService.getUpcomingCalendars(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching upcoming calendars:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get open complex cases (red files) for judge dashboard
 * @route POST /api/dashboard/open-complex-cases
 */
export const getOpenComplexCases = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await homeService.getOpenComplexCases(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching open complex cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Export open complex cases to CSV
 * @route POST /api/dashboard/export-open-complex-cases
 */
export const exportOpenComplexCases = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await homeService.exportOpenComplexCases(userId);
    
    if (!result.success) {
      return res.status(403).json({ error: 'Unauthorized or no data available' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=open_complex_cases.csv');
    res.send(result.data);
  } catch (error) {
    logger.error('Error exporting open complex cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get dockets received for CMA dashboard
 * @route POST /api/dashboard/dockets-received
 */
export const getDocketsReceived = async (req, res) => {
  try {
    const userId = req.userId;
    const result = await homeService.getDocketsReceived(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching dockets received:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
