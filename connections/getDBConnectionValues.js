import {
  getDatabaseCredentialSnapshot,
  refreshDatabaseCredentials,
} from "./databaseCredentialManager.js";

export const getDBConnectionValues = async ({ refresh = false } = {}) => {
  if (refresh) await refreshDatabaseCredentials({ force: true });
  else {
    try { getDatabaseCredentialSnapshot(); }
    catch { await refreshDatabaseCredentials({ force: true }); }
  }
  return getDatabaseCredentialSnapshot();
};
