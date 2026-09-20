import { logger } from "../../config/winstonLogger.js";
// Ensure constants and mapping between modules and their permissions are in sync with frontend/src/utilities/permission.js and vice versa
export const BILLING_CENTER = "BILLING_CENTER";
export const TIME_ENTRY = "TIME_ENTRY";
export const EXPENSE = "EXPENSE";
export const ACCOUNT = "ACCOUNT";
export const CASES = "CASES";
export const EFILE = "EFILE";
export const MANAGE_USER = "MANAGE_USER";
export const ADMIN_SETTINGS = "ADMIN_SETTINGS";
export const MANAGE_TEMPLATES = "MANAGE_TEMPLATES";

export const MODULE_AND_PERMISSION = new Map();

// Mapping of module_name and its permissions and permission_ids
MODULE_AND_PERMISSION.set(BILLING_CENTER, [
  { action: "all", permission_id: 6 },
]);
MODULE_AND_PERMISSION.set(TIME_ENTRY, [{ action: "all", permission_id: 12 }]);
MODULE_AND_PERMISSION.set(EXPENSE, [{ action: "all", permission_id: 13 }]);
MODULE_AND_PERMISSION.set(ACCOUNT, [
  { action: "create", permission_id: 1 },
  { action: "edit", permission_id: 2 },
  { action: "deactivate&restore:all-accounts", permission_id: 3 },
]);
MODULE_AND_PERMISSION.set(MANAGE_USER, [{ action: "all", permission_id: 4 }]);
MODULE_AND_PERMISSION.set(ADMIN_SETTINGS, [
  { action: "all", permission_id: 5 },
]);
MODULE_AND_PERMISSION.set(CASES, [
  { action: "create&edit", permission_id: 7 },
  { action: "delete", permission_id: 8 },
  { action: "close", permission_id: 9 },
]);
MODULE_AND_PERMISSION.set(EFILE, [
  { action: "approve&reject", permission_id: 10 },
]);
MODULE_AND_PERMISSION.set(MANAGE_TEMPLATES, [
  { action: "all", permission_id: 14 },
]);

const hasPermission = (permissions, modulePermissions) => {
  let permissionPresent = false;

  for (const permission of permissions) {
    permissionPresent =
      permission.dataValues.permission_id == modulePermissions.permission_id;
    if (permissionPresent) break;
  }

  return permissionPresent;
};

/**
 * Check if the user has the required permission for a module.
 * @param {string} module - The module name.
 * @param {Array} permissions - The user's permissions.
 * @returns {boolean} - True if the user has the required permission, false otherwise.
 */
export const checkPermission = (module, permissions, action = "all") => {
  const modulePermissions = MODULE_AND_PERMISSION.get(module)?.find(
    (permission) => permission.action == action
  );

  if (!modulePermissions) {
    logger.error(`Module ${module} does not exist in the permissions map.`);
    return false;
  }

  return hasPermission(permissions, modulePermissions);
};
