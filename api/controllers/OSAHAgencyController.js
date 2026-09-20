import User from '../models/User.js';
import Agency from '../models/admin/agencyModel.js';
import { logger } from "../../config/winstonLogger.js";

// Action to fetch user session details
const getUserSessionDetails = async (req, res) => {
    try {
        const { userId } = req.body; // Get userId from request body

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Find user by ID
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] } // Fetch all fields
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({ user });
    } catch (error) {
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
};

const getCommonData = async (req, res) => {
    try {
        const { agencyPlatformId } = req.body;

        if (!agencyPlatformId) {
            return res.status(400).json({ error: 'agencyPlatformId is required' });
        }

        const users = await Agency.getUsers(agencyPlatformId);
        const agencyParties = await Agency.getAgencyParties(agencyPlatformId);
        const agencyTabs = await Agency.getAgencyTabs(agencyPlatformId);
        const additionalInfoData = await Agency.getAdditionalInfoData(agencyPlatformId);

        return res.json({
            users,
            agencyParties,
            agencyTabs,
            additionalInfoData,
        });
    } catch (error) {
        logger.error('Error fetching common data:', error.message);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
};

// Action to fetch rejected Form1 data
const getRejectedForm1 = async (req, res) => {
    try {
      const payload = req.body; // Get payload from request body
      const userId = req.user?.id || 3; // Replace with actual user ID from session or token
      const agencyPlatformId = req.user?.agencyPlatformId || null; // Replace with actual agencyPlatformId from session or token
  
      const rejectedForm1 = await Agency.getRejectedForm1(payload, userId, agencyPlatformId);
  
      return res.json({
        searchSuccess: true,
        dataTotalSize: rejectedForm1.count,
        data: rejectedForm1.data,
      });
    } catch (error) {
      logger.error('Error fetching rejected Form1 data:', error.message);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  };

export { getUserSessionDetails, getCommonData, getRejectedForm1 };
