import express from "express";
import {
  getDataDynamic,
  getDocketStatusList,
  getDdsDocketStatusList,
  searchDataByWhere,
} from "../controllers/reports/dynamicDataController.js";
import {
  generalSearch,
  superuserSearch,
  searchDocketInfo,
} from "../controllers/dashboard/dashboardController.js";
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
// see buildDdsGeneralSearchConditions in ddsSearchQueryBuilder.js)
router.post("/searchResult", generalSearch);

// Same Additional Search Options panel, but submitted while logged in as dds_superuser --
// searches the broader `docket` table (every ALS docket across DDS/DPS), not the current
// user's own form1_docket entries. See superuserSearch in dashboardController.js.
router.post("/superuserSearchResult", superuserSearch);

// dds_superuser's docket click (/docket/reqdt/:caseId, DocketDetailPage.jsx) -- looks a
// case up directly in the `docket` table (legacy: Osahform/searchdocketinfo), since a
// superuser search result row has no form1Id to review through the Form1 flow. Not used
// by the regular DDS clerk search, which already has form1Id and goes straight to
// /form1/reqdt/:form1Id.
router.post("/superuserDocketInfo", searchDocketInfo);

export default router;
