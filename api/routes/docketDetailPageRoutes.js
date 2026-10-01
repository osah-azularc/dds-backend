import express from "express";
import {
  getDocketDocuments,
  downloadDocument,
} from "../controllers/docketDetail/docketDetailPageDocumentController.js";
import { getDisposition } from "../controllers/docketDetail/docketDetailPageController.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

/**
 * Docket Detail Routes
 * Mirrors ecourt-backend's docketDetailPageRoutes.js naming/shape, scoped
 * for now to the read-only listings used by the Form 1 General Information
 * screen (/form1/reqdt/:form1Id): documents, and disposition. Ecourt's own
 * version gates these behind requirePermission(DOCKET_PERMISSIONS.VIEW), but
 * that permission isn't granted to DDS's own roles (dds_clerk/dds_helpdesk/
 * dds_superuser) in role_permissions -- only to the ecourt-side roles. DDS's
 * other route files (ddsForm1Routes.js, dashboardRoutes.js) don't use
 * requirePermission either, so this follows that same DDS-specific
 * convention: auth only, no per-route permission gate.
 *
 * addDisposition/editDisposition are intentionally NOT wired here -- they
 * write to the generic eCourt `docket` table keyed by a real eCourt caseid
 * (see dispositionHelper.js), which DDS's own form1Id is not. Legacy's own
 * DDS form1-controller.js/form1.phtml never actually calls them either (the
 * "Add Decision" modal there has no trigger button and its addDisposition()
 * handler is undefined) -- only the read (getdatadynamic against
 * docketdisposition) is real, confirmed against production.
 */
const router = express.Router();
router.use(getLoggedInUserId);

// Get all documents for a docket/Form 1 case
// Matches Angular (DDS form1-controller.js): SearchFactory.searchbyvalue("documentstable", "Caseid='...'")
router.post("/documents", getDocketDocuments);

// Get disposition data for a docket/Form 1 case
// Matches Angular (DDS form1-controller.js): DynamicFactory.getdynamicdata("docketdisposition", "caseid", form1Id, "1")
router.post("/getDisposition", getDisposition);

// Download/view a document (flag distinguishes view from forced download) -- mirrors
// ecourt-backend's own /downloadDocument + /downloadDocument/:flag (requireDownload there,
// auth-only here per this file's own no-permission-gate convention). Ports legacy's shared
// Osahform/downloaddocument/:id/:flag action.
router.post("/downloadDocument", downloadDocument);
router.post("/downloadDocument/:flag", downloadDocument);

export default router;
