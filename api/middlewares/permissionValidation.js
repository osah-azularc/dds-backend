import jwt from "jsonwebtoken";
import JudgeAssistantClerk from "../models/JudgeAssistantClerk.js";

export const validatePermission = async (req, res, next) => {
  try {
    // Prefer httpOnly cookie (XSS-safe); fall back to Authorization header.
    let token = req.cookies && req.cookies.token;

    if (!token) {
      const bearerToken = req.headers.authorization;
      if (!bearerToken) {
        return res
          .status(401)
          .json({ message: "Authentication token missing!" });
      }
      const [scheme, rawToken] = bearerToken.split(" ");
      if (scheme !== "Bearer" || !rawToken) {
        return res
          .status(401)
          .json({ message: "Invalid authorization format!" });
      }
      token = rawToken;
    }

    let user;
    try {
      user = jwt.verify(token, process.env.TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid token!" });
    }

    // Lookup user by user_id from token
    const userId = user.user_id || user.userId || user.id;
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload!" });
    }

    const userData = await JudgeAssistantClerk.findByPk(userId);
    if (!userData) {
      return res.status(404).json({ message: "User not found!" });
    }

    // Check active status
    if (userData.isActive !== "1") {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    // Check admin route authorization
    const isAdminRoute = req.path && req.path.startsWith("/admin");
    const hasAdminAccess =
      userData.isAdmin === "1" || userData.isActiveBilling === "1";

    if (isAdminRoute && !hasAdminAccess) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    req.user = userData;
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server Error!", error: error.message });
  }
  next();
};
