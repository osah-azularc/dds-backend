import express from "express";
import {
  exportSearchResultsAction,
  downloadCaseFilesAction,
} from "../controllers/searchResultsController.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

/**
 * Search Results Routes
 * Handles the Download Files (ZIP) and Export (CSV) actions on the Docket
 * Search results page ("+ Additional Search Options" -> Search), mirroring
 * legacy's dds/zipfilesdownload and Superuser/exportdata.
 */

const router = express.Router();
router.use(getLoggedInUserId);

router.post("/export", exportSearchResultsAction);
router.post("/download", downloadCaseFilesAction);

export default router;
