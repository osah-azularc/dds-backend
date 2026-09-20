import { getJsonSecret } from "../config/secretsManager.js";

let snapshot;
let refreshPromise;
let refreshTimer;
let onCredentialsChanged = async () => {};

const refreshInterval = () => {
  const value = Number(process.env.DB_SECRET_REFRESH_MS || 60000);
  return Number.isFinite(value) && value >= 1000 ? value : 60000;
};

const isLocal = () => (process.env.NODE_ENV || "local") === "local";

const validateDatabaseCredentials = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Database secret must be a JSON object");
  if (value.engine !== "mysql") throw new Error("Database secret engine must be mysql");
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Database secret port must be a valid integer");
  for (const field of ["host", "dbname", "username", "password"]) {
    if (typeof value[field] !== "string" || value[field].trim() === "") throw new Error(`Database secret ${field} is required`);
  }
  return Object.freeze({ database: value.dbname, host: value.host, port, username: value.username, password: value.password });
};

export const getDatabaseCredentialSnapshot = () => {
  if (!snapshot) throw new Error("Database credentials have not been initialized");
  return snapshot;
};

export const refreshDatabaseCredentials = async ({ force = false } = {}) => {
  if (refreshPromise) return refreshPromise;
  if (isLocal()) {
    snapshot = Object.freeze({
      database: process.env.MYSQL_DATABASE,
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      username: process.env.MYSQL_USERNAME,
      password: process.env.MYSQL_PASSWORD,
      versionId: "local",
    });
    return snapshot;
  }
  if (!force && snapshot) return snapshot;

  refreshPromise = (async () => {
    const response = await getJsonSecret(process.env.DB_SECRET_ID);
    const credentials = validateDatabaseCredentials(response.value);
    const next = Object.freeze({ ...credentials, versionId: response.versionId || "unknown" });
    process.env.MYSQL_DATABASE = next.database;
    process.env.MYSQL_HOST = next.host;
    process.env.MYSQL_PORT = String(next.port);
    process.env.MYSQL_USERNAME = next.username;
    process.env.MYSQL_PASSWORD = next.password;
    const changed = !snapshot || snapshot.versionId !== next.versionId;
    snapshot = next;
    if (changed) await onCredentialsChanged(next);
    return snapshot;
  })();
  try { return await refreshPromise; } finally { refreshPromise = undefined; }
};

export const configureDatabaseCredentialManager = ({ credentialsChanged } = {}) => {
  if (credentialsChanged) onCredentialsChanged = credentialsChanged;
};

export const startDatabaseCredentialRefresh = () => {
  if (isLocal() || refreshTimer) return;
  refreshTimer = setInterval(async () => {
    try { await refreshDatabaseCredentials({ force: true }); }
    catch (error) {
      console.error("Database credential refresh failed", {
        category: error?.category || "validation-error",
        secretId: process.env.DB_SECRET_ID,
      });
    }
  }, refreshInterval());
  refreshTimer.unref?.();
};

export const stopDatabaseCredentialRefresh = () => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = undefined;
};

export const resetDatabaseCredentialManagerForTests = () => {
  stopDatabaseCredentialRefresh(); snapshot = undefined; refreshPromise = undefined; onCredentialsChanged = async () => {};
};
