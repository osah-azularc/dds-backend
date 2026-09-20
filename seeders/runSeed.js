import "dotenv/config";

/**
 * One-off script to stand up roles/permissions/role_permissions on a fresh
 * database (new dev machine, CI, staging reset) — NOT part of the app's
 * normal boot path. Run with: node seeders/runSeed.js
 *
 * Every seeder here is idempotent (each row is looked up by its unique key
 * before being created), so re-running this against a database that already
 * has the data is a safe no-op — it won't create duplicates or touch rows
 * that were since edited by hand in phpMyAdmin/SQL.
 *
 * Order matters: roles and permissions must exist before role_permissions
 * can look either of them up by name.
 */
const run = async () => {
  const { initializeRuntimeConfig } = await import("../config/runtimeConfig.js");
  const { initializeDatabase, closeDatabase } = await import("../connections/seqDB.js");

  await initializeRuntimeConfig();
  await initializeDatabase();

  const { seedRoles } = await import("./roleSeeder.js");
  const { seedPermissions } = await import("./permissionSeeder.js");
  const { seedRolePermissions } = await import("./rolePermissionSeeder.js");

  await seedRoles();
  await seedPermissions();
  await seedRolePermissions();

  await closeDatabase();
  process.exit(0);
};

run().catch((error) => {
  console.error("Seeding failed", error);
  process.exit(1);
});
