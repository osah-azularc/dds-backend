import Role from "../api/models/Role.js";
import Permission from "../api/models/Permission.js";
import RolePermission from "../api/models/RolePermission.js";
import { DDS_PERMISSIONS } from "../api/constants/permissions.js";

// Mirrors the current `role_permissions` table (DDS-only RBAC, 2026-09-27).
// dds_superuser holds every DDS permission. dds_clerk holds everything needed
// for day-to-day case work, but not bulk data export, pushing updates to DPS,
// or deleting a docket.
const rolePermissions = {
  dds_clerk: [
    DDS_PERMISSIONS.HOME_VIEW,
    DDS_PERMISSIONS.DOCKET_SEARCH,
    DDS_PERMISSIONS.DOCKET_VIEW,
    DDS_PERMISSIONS.DOCKET_CREATE,
    DDS_PERMISSIONS.DOCKET_EDIT,
    DDS_PERMISSIONS.PARTY_CREATE,
    DDS_PERMISSIONS.PARTY_EDIT,
    DDS_PERMISSIONS.PARTY_DELETE,
    DDS_PERMISSIONS.ATTORNEY_RESPONDENT_ADD,
    DDS_PERMISSIONS.LICENSE_NUMBER_UPDATE,
    DDS_PERMISSIONS.FORM1205_SEARCH,
    DDS_PERMISSIONS.NOTES_CREATE,
    DDS_PERMISSIONS.HISTORY_VIEW,
    DDS_PERMISSIONS.PERMITS_PRINT,
    DDS_PERMISSIONS.PERMITS_GENERATE_PDF,
    DDS_PERMISSIONS.DOCKET_SEARCH_DOCUMENTS_DOWNLOAD,
    DDS_PERMISSIONS.REJECTED_FORMS_VIEW,
  ],

  dds_superuser: [
    DDS_PERMISSIONS.HOME_VIEW,
    DDS_PERMISSIONS.DOCKET_SEARCH,
    DDS_PERMISSIONS.DOCKET_VIEW,
    DDS_PERMISSIONS.DOCKET_CREATE,
    DDS_PERMISSIONS.DOCKET_EDIT,
    DDS_PERMISSIONS.PARTY_CREATE,
    DDS_PERMISSIONS.PARTY_EDIT,
    DDS_PERMISSIONS.PARTY_DELETE,
    DDS_PERMISSIONS.ATTORNEY_RESPONDENT_ADD,
    DDS_PERMISSIONS.LICENSE_NUMBER_UPDATE,
    DDS_PERMISSIONS.FORM1205_SEARCH,
    DDS_PERMISSIONS.NOTES_CREATE,
    DDS_PERMISSIONS.HISTORY_VIEW,
    DDS_PERMISSIONS.PERMITS_PRINT,
    DDS_PERMISSIONS.PERMITS_GENERATE_PDF,
    DDS_PERMISSIONS.DPS_UPDATE,
    DDS_PERMISSIONS.DOCKET_SEARCH_DOCUMENTS_DOWNLOAD,
    DDS_PERMISSIONS.REJECTED_FORMS_VIEW,
    DDS_PERMISSIONS.DOCKET_SEARCH_EXPORT_DATA,
    DDS_PERMISSIONS.DOCKET_DELETE,
  ],
};

export const seedRolePermissions = async () => {
  try {
    for (const roleName in rolePermissions) {
      const role = await Role.findOne({
        where: {
          name: roleName,
        },
      });

      if (!role) continue;

      for (const permissionName of rolePermissions[roleName]) {
        const permission = await Permission.findOne({
          where: {
            name: permissionName,
          },
        });

        if (!permission) continue;

        const existing = await RolePermission.findOne({
          where: {
            role_id: role.id,
            permission_id: permission.id,
          },
        });

        if (!existing) {
          await RolePermission.create({
            role_id: role.id,
            permission_id: permission.id,
          });
        }
      }
    }

    console.log("Role permissions seeded");
  } catch (error) {
    console.log(error);
  }
};
