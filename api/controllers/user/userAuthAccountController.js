/**
 * @module userAuthAccountController
 * @description Registration and verification handlers.
 */

import User from "../../models/User.js";
import { Op } from "sequelize";
import {
  normalizeString,
  parsePositiveInt,
  isValidHexToken,
} from "./userHelpers.js";

export const verifyEmail = async (req, res) => {
  const userId = parsePositiveInt(req.params?.id);
  const token = normalizeString(req.params?.token);

  if (!userId || !isValidHexToken(token)) {
    return res.status(400).json({ message: "Invalid verification link" });
  }

  try {
    const user = await User.findOne({
      where: { [Op.and]: [{ id: userId }, { verify_token: token }] },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid link" });
    }

    await User.update(
      { isVerified: true, verify_token: "" },
      { where: { id: userId, verify_token: token } }
    );

    res.status(200).json({ message: "Email verified successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Email verification failed", success: false });
  }
};
