import Role from "../api/models/Role.js";

// Mirrors the current `roles` table exactly (DDS-only RBAC, 2026-09-27).
// Roles/permissions/role_permissions are maintained by hand directly in the
// database going forward — this seeder exists to stand up a fresh
// environment (new dev machine, CI, staging reset) with the same data, not
// to be the thing edited when a role changes. Edit the DB, then re-run
// `npm run seed:rbac` to regenerate this file's ground truth if needed.
const roles = [
  { name: "dds_clerk", description: "DDS Clerk – Department of Driver Services clerks" },
  { name: "dds_superuser", description: "DDS Superuser – DDS administrators" },
];

export const seedRoles = async () => {
  try {
    for (const role of roles) {
      const existingRole = await Role.findOne({ where: { name: role.name } });

      if (!existingRole) {
        await Role.create(role);
      }
    }

    console.log("Roles seeded");
  } catch (error) {
    console.log("Roles seeded error", error);
  }
};
