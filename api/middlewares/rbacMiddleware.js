import JudgeAssistantClerk from "../models/JudgeAssistantClerk.js";
import Role from "../models/Role.js";
import { getPermissionNamesForRole } from "../services/rolePermissionService.js";

export { clearPermissionCache } from "../services/rolePermissionService.js";

/**
 * Resolves the logged-in user's active role via the same path the app
 * actually authenticates through: JudgeAssistantClerk.userType -> roles.name
 * (see JudgeAssistantClerk.js's belongsTo(Role, ...) association). Returns
 * null if the user has no role, or their role has been deactivated.
 */
const getActiveRoleForUser = async (userId) => {
  const userData = await JudgeAssistantClerk.findByPk(userId, {
    include: [
      {
        model: Role,
        as: "roleDetails",
        attributes: ["id", "name"],
        where: { is_active: true },
        required: false,
      },
    ],
  });
  return userData?.roleDetails ?? null;
};

/**
 * Must run after an auth middleware that already verified the JWT — it does
 * not re-verify the token itself, only reads the user id that middleware
 * left behind. Two different auth middlewares are in use across routes:
 * getLoggedInUserId sets req.userId directly; permissionValidation.js's
 * validatePermission only sets req.user (a full JudgeAssistantClerk
 * instance, whose primary key is mapped to the `userId` field) — so both
 * shapes are checked here rather than assuming one.
 */
const resolveUserId = (req) => req.userId ?? req.user?.userId ?? req.user?.user_id ?? req.user?.id;

/**
 * @param {string} permissionName - the permission's dotted `name` column,
 *   e.g. HOME_PERMISSIONS.ADDITIONAL_SEARCH_BULK_EMAIL from
 *   api/constants/permissions.js. Always import from that file rather than
 *   typing the string inline, so it stays the single source of truth for
 *   what actually gets checked (permissions/role_permissions are maintained
 *   by hand in the database — there is no seeder to keep a duplicated string
 *   in sync with).
 */
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const normalizedUserId = resolveUserId(req);
      if (!normalizedUserId) {
        return res.status(401).json({ message: "You are not logged in. Please log in to continue." });
      }

      const role = await getActiveRoleForUser(normalizedUserId);
      if (!role) {
        return res.status(403).json({
          message: `Access denied. Required permission: ${permissionName}`,
        });
      }

      const permissionNames = await getPermissionNamesForRole(role.id);
      if (!permissionNames.has(permissionName)) {
        return res.status(403).json({
          message: `Access denied. Required permission: ${permissionName}`,
        });
      }

      req.userRole = role;
      next();
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

/**
 * Same as requirePermission, but passes as soon as the user's role holds ANY
 * one of the given permission names.
 *
 * Needed where a single backend endpoint is genuinely shared by more than
 * one frontend surface that each carry their own permission — e.g.
 * calendarRoutes.js's calendar-management endpoints are called from both the
 * Calendar module (calendar_management.calendar_management) and the Admin
 * module's Calendar Management tab (admin.calendar_mgmt), which are two
 * separate screens over the same data, not one screen with two names for the
 * same permission.
 */
export const requireAnyPermission = (...permissionNames) => {
  return async (req, res, next) => {
    try {
      const normalizedUserId = resolveUserId(req);
      if (!normalizedUserId) {
        return res.status(401).json({ message: "You are not logged in. Please log in to continue." });
      }

      const role = await getActiveRoleForUser(normalizedUserId);
      if (!role) {
        return res.status(403).json({
          message: `Access denied. Required permission: one of ${permissionNames.join(", ")}`,
        });
      }

      const grantedPermissionNames = await getPermissionNamesForRole(role.id);
      const isGranted = permissionNames.some((name) => grantedPermissionNames.has(name));
      if (!isGranted) {
        return res.status(403).json({
          message: `Access denied. Required permission: one of ${permissionNames.join(", ")}`,
        });
      }

      req.userRole = role;
      next();
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};
