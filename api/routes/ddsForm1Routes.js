import express from "express";
import {
  addDocketHandler,
  searchDocketInfoHandler,
  getForm1IdHandler,
  updateDocketHandler,
  deleteDocketHandler,
} from "../controllers/ddsForm1Controller.js";
import {
  addPartyHandler,
  editPartyHandler,
  deletePartyHandler,
  autopopulatePartyHandler,
  getPartyAutofillHandler,
  getPartyListHandler,
} from "../controllers/ddsForm1PartyController.js";
import {
  getNotesHandler,
  saveNoteHandler,
  deleteNoteHandler,
} from "../controllers/ddsForm1NotesController.js";
import { getHistoryHandler } from "../controllers/ddsForm1HistoryController.js";
import { getAllStates } from "../controllers/stateController.js";
import {
  updateDdsToDpsHandler,
  addPartyDetailsHandler,
  addAttorneyRespondentHandler,
  search1205InfoHandler,
} from "../controllers/ddsForm1205Controller.js";
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
router.post("/searchdocketinfo", searchDocketInfoHandler);
router.post("/getForm1Id", getForm1IdHandler);
router.post("/updatedocket", updateDocketHandler);
router.post("/deletedocket", deleteDocketHandler);

// Add/Edit/Delete Party (existing-docket review screen's Party Information section).
router.post("/addPartyDDSDetails", addPartyHandler);
router.post("/editpartydetails", editPartyHandler);
router.post("/deleteparty", deletePartyHandler);
router.post("/autopopulatedds", autopopulatePartyHandler);
router.post("/getddsinformation", getPartyAutofillHandler);
router.post("/get-party-details", getPartyListHandler);
router.get("/getAllStates", getAllStates);

// Form 1205 screen (Officer Information + docket DPS/Respondent Attorney finalization).
router.post("/search1205info", search1205InfoHandler);
router.post("/addPartyDetails", addPartyDetailsHandler);
router.post("/addattorneyrespondent", addAttorneyRespondentHandler);
router.post("/updateddstodps", updateDdsToDpsHandler);

// Notes/Summary (existing-docket review screen's Notes tab).
router.post("/get-notes", getNotesHandler);
router.post("/savenotes", saveNoteHandler);
router.post("/deletenotes", deleteNoteHandler);

// Audit trail (existing-docket review screen's History tab).
router.post("/get-history", getHistoryHandler);

export default router;
