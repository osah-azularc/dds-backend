import JudgeAssistantClerk from "../models/JudgeAssistantClerk.js";
import Role from "../models/Role.js";
import { getPermissionNamesForRole } from "../services/rolePermissionService.js";
import { isLocalHost } from "../../helpers/helper.js";
import { DDS_ROLES } from "../constants/roles.js";
// Use server logger
import { logger, activityLogger } from "../../config/winstonLogger.js";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import * as refreshTokenStore from "../utilities/refreshTokenStore.js";
import {
  recordFailedAttempt,
  resetAttempts,
} from "../middlewares/accountLockout.js";

const authenticateAction = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input (keep behavior: require both but respond generically)
    if (!username || !password) {
      return res
        .status(403)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Construct email
    const email = `${username}@osah.ga.gov`;

    // Query DB
    const result = await JudgeAssistantClerk.findAll({
      where: { email },
      include: [
        {
          model: Role,
          as: "roleDetails",
          attributes: ["id", "name"],
          where: { is_active: true },
          required: false,
        },
      ],
      raw: true,
    });

    // If user not found or no rows
    if (!result || result.length === 0) {
      // Record failed attempt for account lockout
      recordFailedAttempt(email);
      activityLogger.error(
        `[Auth] Failed login attempt for ${email} (user not found)`,
      );
      return res
        .status(403)
        .json({ success: false, message: "Invalid credentials" });
    }

    const user = result[0];

    // Active status - do not reveal status to caller
    if (user.isActive !== "1") {
      recordFailedAttempt(email);
      activityLogger.error(
        `[Auth] Failed login attempt for ${email} (inactive)`,
      );
      return res.status(403).json({
        success: false,
        message:
          "You are not an active user. Please contact your administrator for access to eCourt.",
      });
    }

    // DDS only allows its own roles to log in, even though the shared
    // judge_assistant_clerk table also holds eCourt-only roles (judge, cma, etc).
    if (!DDS_ROLES.includes(user.userType)) {
      recordFailedAttempt(email);
      activityLogger.error(
        `[Auth] Failed login attempt for ${email} (not a DDS user, role: ${user.userType})`,
      );
      return res.status(403).json({
        success: false,
        message:
          "You are not a DDS user. Please contact your administrator for access to DDS.",
      });
    }

    // Fetch permissions granted to the user's role (userType -> roles.name)
    let permissions = [];
    const roleId = user["roleDetails.id"];
    if (roleId) {
      permissions = Array.from(await getPermissionNamesForRole(roleId));
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate(async (err) => {
      if (err) {
        activityLogger.error(
          `[Auth] Session regeneration failed for ${email}: ${err.message}`,
        );
        return res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }

      const cookieName = Buffer.from("eCourtcookie").toString("base64");

      // Allow insecure cookies on localhost for local dev; require secure cookies elsewhere
      const cookieSecure = !isLocalHost(req);

      const secureOpts = {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "Lax",
        path: "/",
      };

      // Create short-lived access token and long-lived refresh token
      const tokenData = {
        id: user.userId,
        email: user.email,
        user_type: user.userType,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        isActiveBilling: user.isActiveBilling,
        review_form1s: user.reviewForm1s || 0,
      };

      const accessToken = jwt.sign(tokenData, process.env.TOKEN_SECRET, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES || "60m",
      });

      const refreshToken = jwt.sign(
        { user_id: user.userId },
        process.env.REFRESH_TOKEN_SECRET || process.env.TOKEN_SECRET,
        {
          expiresIn: process.env.REFRESH_TOKEN_EXPIRES || "7d",
        },
      );

      // Save refresh token server-side (in-memory store; replace with DB/Redis in prod)
      refreshTokenStore.saveToken(user.userId, refreshToken);

      // Encrypt email for 'user' cookie (if frontend expects it), but keep cookie minimal and secure
      const aesKey = crypto
        .createHash("sha256")
        .update(process.env.USER_SECRET)
        .digest();
      const aesIv = crypto.randomBytes(12);
      const aesCipher = crypto.createCipheriv("aes-256-gcm", aesKey, aesIv);
      const userData = Buffer.concat([
        aesIv,
        aesCipher.update(user.email, "utf8"),
        aesCipher.final(),
        aesCipher.getAuthTag(),
      ]).toString("base64");

      // Set cookies with security flags
      // NOTE: `token` and `verified` are intentionally readable by the frontend code
      // because current client-side logic reads them via js-cookie. Consider moving to
      // httpOnly cookies + server-side session checks for better security.
      res.cookie("token", accessToken, {
        httpOnly: false,
        secure: cookieSecure,
        sameSite: "Lax",
        maxAge: 60 * 60 * 1000,
        path: "/",
      }); // 60m
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      }); // 7d

      // Reset account lockout tracking if any
      resetAttempts(email);

      activityLogger.info(
        `[Auth] Login successful for ${email} (user_id: ${user.userId})`,
      );

      return res.json({
        message: "Login successful!",
        success: true,
        token: accessToken,
        permissions,
      });
    });
  } catch (error) {
    activityLogger.error(`[Auth] Login error: ${error && error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const logoutAction = (req, res) => {
  try {
    // Revoke refresh token if present
    const refreshToken = req.cookies && req.cookies.refreshToken;
    if (refreshToken) {
      refreshTokenStore.revokeToken(refreshToken);
    }

    // Clear relevant cookies (use same properties used when setting them)
    const cookieSecure = !isLocalHost(req);

    const cookieOptsHttpOnly = {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "Lax",
      path: "/",
    };
    const cookieOptsClient = {
      httpOnly: false,
      secure: cookieSecure,
      sameSite: "Lax",
      path: "/",
    };

    const cookieName = Buffer.from("eCourtcookie").toString("base64");
    // eCourtcookie was set server-only
    res.clearCookie(cookieName, cookieOptsHttpOnly);
    // token and verified were set as client-readable to support existing frontend behavior
    res.clearCookie("token", cookieOptsClient);
    res.clearCookie("verified", cookieOptsClient);
    // refresh token is httpOnly
    res.clearCookie("refreshToken", cookieOptsHttpOnly);
    // 'user' cookie was set as readable to client
    res.clearCookie("user", cookieOptsClient);

    req.session.destroy((err) => {
      if (err) {
        activityLogger.error(`[Auth] Logout failed: ${err.message}`);
        return res
          .status(500)
          .json({ error: "Logout failed", message: err.message });
      }
      activityLogger.info("[Auth] User logged out successfully");
      res.json({ message: "Logged out successfully" });
    });
  } catch (error) {
    activityLogger.error(`[Auth] Logout error: ${error && error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export { authenticateAction, logoutAction };
