import User from "../models/User.js"; // MySQL User model - KEEP THIS
import Agency from "../models/admin/agencyModel.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import crypto from "crypto";
import qrcode from "qrcode";
import axios from "axios";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { clients } from "../../app-ecourt.js";
import WebSocket from "ws"; // Import the WebSocket library
import {
  MESSAGES,
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from "../constants/constant-messages.js";
import { insertModuleAuditLog } from "../helpers/auditLogs.helper.js";

import {
  getPublicFileDetailsFromS3,
  uploadPublicFile,
} from "../../helpers/s3public.js";

const moduleNames = [AUDIT_LOG_MODULE_NAME.USERS];

export const logoutUser = async (req, res) => {
  try {
    clients.delete(req.email);

    const cookieOptsHttpOnly = {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      path: "/",
    };
    const cookieOptsClient = {
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      path: "/",
    };
    const cookieName = Buffer.from("eCourtcookie").toString("base64");

    res.clearCookie("token", cookieOptsClient);
    res.clearCookie("token", cookieOptsHttpOnly);
    res.clearCookie("refreshToken", cookieOptsHttpOnly);
    res.clearCookie("user", cookieOptsClient);
    res.clearCookie("verified", cookieOptsClient);
    res.clearCookie("socialverified", cookieOptsClient);
    res.clearCookie(cookieName, cookieOptsHttpOnly);

    if (req.session) {
      return req.session.destroy((sessionError) => {
        if (sessionError) {
          return res.status(500).json({ error: "Log out failed" });
        }
        return res.json({
          message: "You have been logged out!",
          success: true,
        });
      });
    }

    return res.json({
      message: "You have been logged out!",
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ error: "Log out failed" });
  }
};

export const cancelEmailInvitation = async (req, res) => {
  const { userId, adminEmail } = req.body;
  try {
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const admin = await User.findOne({ where: { email: adminEmail } });

    const archivedUser = await Users_Archived.create({
      ...user.dataValues,
      deleted_by: admin.dataValues.id,
      is_invite_cancelled: true,
    });

    // Remove the user
    await User.destroy({ where: { id: userId } });

    if (archivedUser) {
      for (const moduleName of moduleNames) {
        insertModuleAuditLog(
          req.userId,
          AUDIT_LOG_ACTIONS.CANCELED_INVITATION,
          `{{User}} canceled invitation for ${user.first_name} ${user.last_name} + ${user.email}`,
          moduleName,
          "",
          userId,
          "",
          "",
          "",
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Invite cancelled successfully",
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const checkEmailExists = async (req, res) => {
  const { email } = req.query;
  try {
    const user = await User.findOne({ where: { email } });

    if (user) {
      return res.status(200).json({ success: true, exists: true });
    } else {
      return res.status(200).json({ success: true, exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
