import express from "express";

import upload from "../middlewares/uploadMiddleware.js";

//Import controllers here
import {
  logoutUser,
  cancelEmailInvitation,
  checkEmailExists,
} from "../controllers/userController.js";
import { fetchLoggedInUserDetails } from "../controllers/user/userManagementProfileController.js";
import { authenticateAction } from "../controllers/authController.js";
import getLoggedInUserId from "../middlewares/getLoggedInUserId.js";

const router = express.Router();

router.post("/login", authenticateAction);
router.post("/logout", getLoggedInUserId, logoutUser); //

router.post(
  "/cancel-email-invitation",
  getLoggedInUserId,
  cancelEmailInvitation,
);
router.post("/check-email-exists", checkEmailExists);

router.get(
  "/fetch-logged-in-user-details",
  getLoggedInUserId,
  fetchLoggedInUserDetails,
);

export default router;
