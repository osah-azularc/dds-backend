/**
 * @module userAuthSessionController
 * @description Login, logout, OTP validation, and signed-up-user listing.
 */

import User from "../../models/User.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { MESSAGES } from "../../constants/constant-messages.js";
import { isLocalHost } from "../../../helpers/helper.js";
import {
  normalizeString,
  normalizeEmail,
  isValidEmail,
} from "./userHelpers.js";
import { activityLogger } from "../../../config/winstonLogger.js";

const getRealtimeContext = () => import("../../../app-ecourt.js");

export const twoFaValidate = async (req, res) => {
  const isVerified = Boolean(req.body?.isVerified);
  const user = normalizeEmail(req.body?.user);
  const ipAddress = normalizeString(req.body?.ipAddress);
  const location = normalizeString(req.body?.location);
  const name = normalizeString(req.body?.name);

  if (!user || !ipAddress || !location) {
    return res.status(404).json({ message: "All details are reuired!", success: false });
  }
  if (!isValidEmail(user)) {
    return res.status(400).json({ message: "Invalid user email", success: false });
  }
  if (ipAddress.length > 100 || location.length > 255 || name.length > 150) {
    return res.status(400).json({ message: "Invalid request payload" });
  }

  await User.update(
    { ip_address: ipAddress, location: location },
    { where: { email: user } }
  );

  try {
    if (isVerified) {
      return res.status(201).json({
        message: "Logged in successfully",
        success: true,
        isVerified: true,
        userName: name,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: "OTP Verification failed" });
  }
};

export const fetchSignedUpUsers = async (req, res) => {
  try {
    const applicationUsers = await User.findAll();

    const userList = applicationUsers.map((obj) => ({
      name: obj.first_name,
      email: obj.email,
      ip: obj.ip_address,
      location: obj.location,
    }));

    return res.status(200).json({ userList, success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const { clients } = await getRealtimeContext();
    const cookieSecure = !isLocalHost(req);
    const httpOnlyCookieOptions = {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "Lax",
      path: "/",
    };
    const legacyClientCookieOptions = {
      httpOnly: false,
      secure: cookieSecure,
      sameSite: "Lax",
      path: "/",
    };
    const cookieName = Buffer.from("eCourtcookie").toString("base64");

    if (req.email) {
      clients.delete(req.email);
    }

    res.clearCookie(cookieName, httpOnlyCookieOptions);
    res.clearCookie("token", httpOnlyCookieOptions);
    res.clearCookie("refreshToken", httpOnlyCookieOptions);
    res.clearCookie("user", legacyClientCookieOptions);
    res.clearCookie("verified", legacyClientCookieOptions);
    res.clearCookie("socialverified", legacyClientCookieOptions);

    const finalizeLogout = () => {
      if (!req.session) {
        return res.json({ message: "You have been logged out!", success: true });
      }

      return req.session.destroy((sessionError) => {
        if (sessionError) {
          return res.status(500).json({ error: "Log out failed" });
        }

        return res.json({ message: "You have been logged out!", success: true });
      });
    };

    if (typeof req.logout === "function") {
      return req.logout((logoutError) => {
        if (logoutError) {
          return res.status(500).json({ error: "Log out failed" });
        }

        return finalizeLogout();
      });
    }

    return finalizeLogout();
  } catch (error) {
    return res.status(500).json({ error: "Log out failed" });
  }
};

export const loginUser = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizeString(req.body?.password);
  const { wss } = await getRealtimeContext();
  const ipAddress =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress;

  if (!email || !password) {
    return res.json({ message: "One or more required fields are missing", success: false });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format", success: false });
  }
  if (password.length > 128) {
    return res.status(400).json({ message: "Invalid password", success: false });
  }

  try {
    const userDataId = await User.findOne({ where: { email }, attributes: ["user_id"] });
    const loginActivity = null;

    const userExists = await User.findOne({ where: { email } });

    if (!userExists) {
      activityLogger.error(
        `[LoginAttemptFail] (User ID: 0, Email: ${email}) Unable to log In, user not found.`
      );
      return res.status(200).json({
        message: "Unable to login",
        success: false,
        action: MESSAGES.USER_NOT_FOUND,
      });
    }

    if (userExists.is_account_locked) {
      activityLogger.error(
        `[LoginAttemptFail] (User ID: ${userExists.user_id}, Email: ${email}) Account is locked.`
      );
      return res.status(200).json({
        message: "Account is locked. Please contact administrator.",
        success: false,
        action: MESSAGES.ACCOUNT_LOCKED,
      });
    }

    if (userExists.status !== "1" && userExists.status !== "active") {
      activityLogger.error(
        `[LoginAttemptFail] (User ID: ${userExists.user_id}, Email: ${email}) User is not active.`
      );
      return res.status(200).json({
        message: "User account is not active.",
        success: false,
        action: MESSAGES.USER_NOT_ACTIVE,
      });
    }

    if (!userExists.password || userExists.password.length === 0) {
      return res.status(200).json({
        message: "No password set for this account.",
        success: false,
        action: "no_password",
      });
    }

    const validPassword = await bcryptjs.compare(password, userExists.password);

    if (!validPassword) {
      const currentAttempts = userExists.login_attempts || 0;
      await User.update(
        {
          login_attempts: currentAttempts + 1,
          account_locked_time:
            currentAttempts + 1 >= 5 ? new Date() : userExists.account_locked_time,
          is_account_locked: currentAttempts + 1 >= 5,
        },
        { where: { email } }
      );
      activityLogger.error(
        `[LoginAttemptFail] (User ID: ${userExists.user_id}, Email: ${email}) Invalid password. Attempt: ${currentAttempts + 1}`
      );
      return res.status(200).json({
        message: "Invalid password.",
        success: false,
        action: MESSAGES.INVALID_PASSWORD,
      });
    }

    await User.update(
      {
        login_attempts: 0,
        account_locked_time: null,
        is_account_locked: false,
        last_login: new Date(),
      },
      { where: { email } }
    );

    const permissions = [];
    const tokenData = {
      id: userExists.user_id,
      user_id: userExists.user_id,
      userId: userExists.user_id,
      email: userExists.email,
      role: "user",
    };
    const token = jwt.sign(tokenData, process.env.TOKEN_SECRET, { expiresIn: "24h" });

    const cookieSecure = !isLocalHost(req);

    res.cookie("token", token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "Lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "login",
            message: "User logged in",
            user: userExists.dataValues.email,
          })
        );
      }
    });

    activityLogger.info(
      `[LoginSuccess] (User ID: ${userExists.user_id}, Email: ${email}) User logged in successfully.`
    );

    return res.status(201).json({
      message: "Login successful!",
      success: true,
      id: userExists.dataValues.user_id,
      email: userExists.dataValues.email,
      firstName: userExists.dataValues.firstname,
      lastName: userExists.dataValues.lastname,
      rolesPermissions: { id: 0, name: "user", permissions },
    });
  } catch (error) {
    activityLogger.error(`[LoginAttemptFail] ${email} unable to log in, due to ${error}`);
    return res.status(500).json({ error: "Login failed" });
  }
};
