import express from "express";
import { addDocketHandler } from "../controllers/ddsForm1Controller.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

/**
 * DDS Form 1 Routes
 * Handles the "Enter New Form 1" screen's API calls. Path matches the
 * legacy DDS portal's own route namespace (dds-form1/...), distinct from
 * osahForm1Routes.js which serves OSAH staff's internal docket tools.
 */

const router = express.Router();
router.use(getLoggedInUserId);

router.post("/adddocket", addDocketHandler);

export default router;
