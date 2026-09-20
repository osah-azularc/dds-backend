/**
 * @module userManagementProfileController
 * @description Logged-in user profile, password, and signature operations.
 */

import User from "../../models/User.js";
import bcryptjs from "bcryptjs";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import {
  getPublicFileDetailsFromS3,
  uploadPublicFile,
} from "../../../helpers/s3public.js";
import {
  normalizeString,
  parsePositiveInt,
  isValidOptionalPhoneFax,
} from "./userHelpers.js";
import JudgeAssistantClerk from "../../models/JudgeAssistantClerk.js";
import Role from "../../models/Role.js";
import { getPermissionNamesForRole } from "../../services/rolePermissionService.js";

export const fetchLoggedInUserDetails = async (req, res) => {
  try {
    const normalizedUserId = parsePositiveInt(req.userId);

    if (!normalizedUserId) {
      return res.status(401).json({
        status: 401,
        title: "Authentication Required",
        success: false,
        message: "You are not logged in. Please log in to continue.",
      });
    }

    const jacUser = await JudgeAssistantClerk.findOne({
      where: { userId: normalizedUserId },
      attributes: [
        "userId",
        "email",
        "firstName",
        "lastName",
        "userType",
        "isAdmin",
        "isActiveBilling",
        "reviewForm1s",
      ],
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

    if (!jacUser) {
      return res.status(404).json({
        status: 404,
        title: "User Not Found",
        success: false,
        message: "Authenticated user details could not be found.",
      });
    }

    // Fetch permissions granted to the user's role (userType -> roles.name)
    let permissions = [];
    const roleId = jacUser["roleDetails.id"];
    if (roleId) {
      permissions = Array.from(await getPermissionNamesForRole(roleId));
    }

    const user = {
      user_id: jacUser.userId,
      userId: jacUser.userId,
      email: jacUser.email,
      FirstName: jacUser.firstName,
      LastName: jacUser.lastName,
      user_type: jacUser.userType,
      isAdmin: jacUser.isAdmin,
      isActiveBilling: jacUser.isActiveBilling,
      review_form1s: jacUser.reviewForm1s,
      permissions,
    };

    return res.status(200).json({
      status: 200,
      title: "Logged In User Details obtained successfully",
      data: { user },
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      title: "Unable to Fetch User Details",
      message: "Internal server error. Please try again.",
      success: false,
    });
  }
};
