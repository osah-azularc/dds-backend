import express from "express";
import { getDocketDocuments } from "../controllers/docketDetail/docketDetailPageDocumentController.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

/**
 * Docket Detail Routes
 * Mirrors ecourt-backend's docketDetailPageRoutes.js naming/shape, scoped
 * for now to the "Document & File Management" listing used by the Form 1
 * General Information screen (/form1/reqdt/:form1Id). Ecourt's own version
 * gates this behind requirePermission(DOCKET_PERMISSIONS.VIEW), but that
 * permission isn't granted to DDS's own roles (dds_clerk/dds_helpdesk/
 * dds_superuser) in role_permissions -- only to the ecourt-side roles. DDS's
 * other route files (ddsForm1Routes.js, dashboardRoutes.js) don't use
 * requirePermission either, so this follows that same DDS-specific
 * convention: auth only, no per-route permission gate.
 */
const router = express.Router();
router.use(getLoggedInUserId);

// Get all documents for a docket/Form 1 case
// Matches Angular (DDS form1-controller.js): SearchFactory.searchbyvalue("documentstable", "Caseid='...'")
router.post("/documents", getDocketDocuments);

export default router;
