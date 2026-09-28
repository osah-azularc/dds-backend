import express from "express";
import {
  getDataDynamic,
  getDocketStatusList,
  getDdsDocketStatusList,
  searchDataByWhere,
} from "../controllers/reports/dynamicDataController.js";
import { generalSearch } from "../controllers/dashboard/dashboardController.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

/**
 * Dashboard Routes
 * Handles dashboard-specific API endpoints (docket search filter data)
 */

const router = express.Router();
router.use(getLoggedInUserId);

// Dropdown data for the Docket Search "Additional Search Options" panel
router.post("/getDataDynamic", getDataDynamic);
router.post("/getDocketStatusList", getDocketStatusList);
router.post("/getDdsDocketStatusList", getDdsDocketStatusList);
router.post("/searchDataByWhere", searchDataByWhere);

// Docket Search "Additional Search Options" results (telv_o_five='1' DDS dockets only —
// see buildGeneralSearchConditions in dashboardQueryBuilder.js)
router.post("/searchResult", generalSearch);

export default router;
