/**
 * Fails if the backend and frontend permission catalogs have drifted apart.
 *
 * There are two hand-maintained copies of "what permission strings exist":
 *   - api/constants/permissions.js (this repo) - nested by module, the
 *     source of truth for what a route/seeder should check.
 *   - ../ecourt-frontend/src/utilities/permissions.js - flat PERMISSIONS
 *     map, used by hasPermission() on buttons/tabs/routes.
 * Nothing type-checks or lints across the two repos, so a permission added
 * (or renamed) on one side and forgotten on the other fails silently at
 * runtime instead of at build time - this script is the missing check.
 *
 * Usage: node scripts/check-permission-catalogs.js
 * Assumes ecourt-frontend is checked out as a sibling directory of this
 * repo (true for local dev; wire into CI only once that's also true there -
 * this is deliberately not wired into `npm run build`/`test` yet, since a
 * missing sibling checkout would fail unrelated builds).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_CONSTANTS_PATH = path.resolve(__dirname, "../api/constants/permissions.js");
const FRONTEND_CONSTANTS_PATH = path.resolve(
  __dirname,
  "../../ecourt-frontend/src/utilities/permissions.js",
);

const flattenValues = (obj, values = []) => {
  for (const value of Object.values(obj)) {
    if (typeof value === "string") values.push(value);
    else if (value && typeof value === "object") flattenValues(value, values);
  }
  return values;
};

const main = async () => {
  if (!existsSync(FRONTEND_CONSTANTS_PATH)) {
    console.warn(
      `Skipping: frontend repo not found at ${FRONTEND_CONSTANTS_PATH} (expected as a sibling of ecourt-backend).`,
    );
    process.exit(0);
  }

  const backendModule = await import(pathToFileURL(BACKEND_CONSTANTS_PATH).href);
  const frontendModule = await import(pathToFileURL(FRONTEND_CONSTANTS_PATH).href);

  // backendModule.PERMISSIONS is nested (PERMISSIONS.HOME.VIEW); frontend's
  // PERMISSIONS is flat (PERMISSIONS.HOME_VIEW) - compare by the permission
  // *string value* (e.g. "home.view"), which is what actually has to match,
  // not by key name/shape, which are intentionally different.
  const backendValues = new Set(flattenValues(backendModule.PERMISSIONS));
  const frontendValues = new Set(flattenValues(frontendModule.PERMISSIONS));

  const missingFromFrontend = [...backendValues].filter((v) => !frontendValues.has(v)).sort();
  const missingFromBackend = [...frontendValues].filter((v) => !backendValues.has(v)).sort();

  if (missingFromFrontend.length === 0 && missingFromBackend.length === 0) {
    console.log(`✔  Permission catalogs match (${backendValues.size} permissions).`);
    process.exit(0);
  }

  if (missingFromFrontend.length > 0) {
    console.error("In backend constants but missing from frontend PERMISSIONS:");
    for (const name of missingFromFrontend) console.error(`  - ${name}`);
  }
  if (missingFromBackend.length > 0) {
    console.error("In frontend PERMISSIONS but missing from backend constants:");
    for (const name of missingFromBackend) console.error(`  - ${name}`);
  }
  process.exit(1);
};

main().catch((error) => {
  console.error("Permission catalog check failed to run:", error);
  process.exit(1);
});
