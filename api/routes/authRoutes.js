import express from "express";
import rateLimit from "express-rate-limit";
import {
  authenticateAction,
  logoutAction,
} from "../controllers/authController.js";
import { getUserSessionDetails } from "../controllers/OSAHAgencyController.js";
import { accountLockoutMiddleware } from "../middlewares/accountLockout.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// POST routes
// Apply IP-based rate limiter, then account lockout check, then the authenticate action
router.post(
  "/login",
  loginLimiter,
  accountLockoutMiddleware,
  authenticateAction
);
router.post("/logout", logoutAction);
router.post("/getUserSessionDetails", getUserSessionDetails); // Add the route for getUserSessionDetails

export default router;
