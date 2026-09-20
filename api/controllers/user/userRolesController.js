/**
 * @module userRolesController
 * @description Manages RBAC seeding and role/permission listing:
 *   setUserRoleandPermissions, getAllRolesWithPermissions, getAllPermissionsWithRoles
 */

import User from "../../models/User.js";
import Role from "../../models/Role.js";
import Permission from "../../models/Permission.js";
import RolePermission from "../../models/RolePermission.js";
import { parsePositiveInt } from "./userHelpers.js";

// ---------------------------------------------------------------------------
// Seed data (used only by setUserRoleandPermissions)
// ---------------------------------------------------------------------------

const dummyRoles = [
  { role_name: "admin" },
  { role_name: "editor" },
  { role_name: "viewer" },
];
const dummyPermissions = [
  { permission_name: "Read" },
  { permission_name: "Write" },
  { permission_name: "Update" },
  { permission_name: "Delete" },
];
const dummyRolePermissions = [
  { role_id: 1, permission_id: 1 },
  { role_id: 1, permission_id: 2 },
  { role_id: 1, permission_id: 3 },
  { role_id: 1, permission_id: 4 },
  { role_id: 2, permission_id: 1 },
  { role_id: 2, permission_id: 2 },
  { role_id: 2, permission_id: 3 },
  { role_id: 3, permission_id: 1 },
];

/**
 * Seeds dummy roles, permissions, and role-permission mappings into the DB.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const setUserRoleandPermissions = async (req, res) => {
  try {
    for (const role of dummyRoles) {
      await Role.create(role);
    }

    await User.update({ role_id: 1 }, { where: { id: 1 } });

    for (const permission of dummyPermissions) {
      await Permission.create(permission);
    }

    for (const rolePermission of dummyRolePermissions) {
      await RolePermission.create(rolePermission);
    }

    res.json({ message: "Dummy data inserted successfully" });
  } catch (error) {
    res.status(500).send("Error occurred while inserting dummy data");
  }
};

/**
 * Returns all active roles with their associated permissions.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getAllRolesWithPermissions = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query?.page) || 1;
    const requestedLimit = parsePositiveInt(req.query?.limit) || 10;
    const limit = Math.min(requestedLimit, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Role.findAndCountAll({
      where: { is_disabled: false },
      include: [
        {
          model: RolePermission,
          as: "rolePermissions",
          include: [
            {
              model: Permission,
              as: "permission",
              attributes: ["id", "permission_name", "section", "is_creator", "description", "is_elevated"],
            },
          ],
        },
      ],
      attributes: ["id", "role_name"],
      limit,
      offset,
    });

    const transformedRoles = rows.map((role) => ({
      id: role.id,
      role_name: role.role_name,
      permissions: role.rolePermissions.map((rp) => ({
        permission_id: rp.permission.id,
        permission_name: rp.permission.permission_name,
        section: rp.permission.section,
        is_creator: rp.permission.is_creator,
        description: rp.permission.description,
        is_elevated: rp.permission.is_elevated,
      })),
    }));

    res.status(200).json({
      success: true,
      data: transformedRoles,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
};

/**
 * Returns all permissions with their associated roles.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getAllPermissionsWithRoles = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query?.page) || 1;
    const requestedLimit = parsePositiveInt(req.query?.limit) || 10;
    const limit = Math.min(requestedLimit, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Permission.findAndCountAll({
      include: [
        {
          model: RolePermission,
          as: "rolePermissions",
          include: [
            {
              model: Role,
              as: "role",
              attributes: ["id", "role_name"],
            },
          ],
        },
      ],
      attributes: ["id", "permission_name", "section", "is_creator", "description", "is_elevated"],
      limit,
      offset,
    });

    const transformedPermissions = rows.map((permission) => ({
      permission_id: permission.id,
      permission_name: permission.permission_name,
      section: permission.section,
      is_creator: permission.is_creator,
      description: permission.description,
      is_elevated: permission.is_elevated,
      roles: permission.rolePermissions.map((rp) => ({
        role_id: rp.role.id,
        role_name: rp.role.role_name,
      })),
    }));

    res.status(200).json({
      success: true,
      data: transformedPermissions,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
};

