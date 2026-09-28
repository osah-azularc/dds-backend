import express from 'express';
import { triggerDays91Cron } from '../controllers/cronController.js';
import getLoggedInUserId from '../middlewares/getLoggedInUserId.js';

// Description : Manual cron-trigger endpoints. Kept separate from any one feature's routes
// so triggering an ops job never inherits or drifts from a business-feature's permission
// model by accident.

const router = express.Router();
router.use(getLoggedInUserId);

// Mirrors legacy's `wget .../dds-form1/days91` cron - see days91Cron.js.
router.get('/run-days91-cron', triggerDays91Cron);

export default router;
