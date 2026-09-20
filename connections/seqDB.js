import { Sequelize } from "sequelize";
import { getDBConnectionValues } from "./getDBConnectionValues.js";
import {
  configureDatabaseCredentialManager,
  getDatabaseCredentialSnapshot,
  refreshDatabaseCredentials,
  startDatabaseCredentialRefresh,
} from "./databaseCredentialManager.js";

let database;
let initialized = false;

const databaseNotInitialized = () => new Error("Database has not been initialized");

// Keep the public database handle immutable while allowing credentials and
// connections to be refreshed internally.
export const mysqlSequelize = new Proxy({}, {
  get(_target, property) {
    if (!database) throw databaseNotInitialized();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

const errorCategory = (error) => {
  if (error?.name === "SequelizeAccessDeniedError") return "access-denied";
  if (error?.name === "SequelizeConnectionRefusedError") return "connection-refused";
  if (error?.name === "SequelizeConnectionError") return "connection-error";
  return "database-error";
};

const recycleIdleConnections = async () => {
  const pool = database?.connectionManager?.pool;
  if (pool?.clear) await pool.clear();
};

const authenticateWithRecovery = async (attempts = 3) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await database.authenticate();
      return;
    } catch (error) {
      if (attempt === attempts) {
        const safeError = new Error(`Database authentication failed (${errorCategory(error)})`);
        safeError.category = errorCategory(error);
        // TEMPORARY DIAGNOSTIC: non-sensitive fields only (no host/port/credentials/SQL).
        // Safe to remove once the SequelizeConnectionRefusedError investigation is done.
        const diagnosticFields = {
          name: error?.name,
          parentCode: error?.parent?.code,
          parentErrno: error?.parent?.errno,
          parentSqlState: error?.parent?.sqlState,
          originalCode: error?.original?.code,
        };
        safeError.diagnostic = Object.fromEntries(
          Object.entries(diagnosticFields).filter(([, value]) => value !== undefined),
        );
        throw safeError;
      }
      try { await refreshDatabaseCredentials({ force: true }); } catch { /* retain last known-good */ }
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.floor(Math.random() * 100)));
    }
  }
};

export const initializeDatabase = async () => {
  if (initialized) return mysqlSequelize;
  const credentials = await getDBConnectionValues({ refresh: true });

  database = new Sequelize(
    credentials.database,
    credentials.username,
    credentials.password,
    {
      host: credentials.host,
      port: credentials.port,
      dialect: "mysql",
      logging: false,
      pool: { max: 20, min: 0, acquire: 60000, idle: 10000, maxUses: 100 },
    },
  );

  // Register before the first authenticate call so every physical connection
  // uses the current in-memory snapshot.
  database.beforeConnect(async (connectionConfig) => {
    const current = getDatabaseCredentialSnapshot();
    connectionConfig.host = current.host;
    connectionConfig.port = current.port;
    connectionConfig.database = current.database;
    connectionConfig.username = current.username;
    connectionConfig.password = current.password;
  });

  configureDatabaseCredentialManager({ credentialsChanged: async (next) => {
    console.info("Database credential version changed", { versionId: next.versionId });
    await recycleIdleConnections();
  }});

  await authenticateWithRecovery();
  initialized = true;
  startDatabaseCredentialRefresh();
  console.info("MySQL database authenticated", { versionId: credentials.versionId });
  return mysqlSequelize;
};

export const refreshDatabaseConnectionCredentials = async () => {
  await refreshDatabaseCredentials({ force: true });
  await recycleIdleConnections();
};

export const closeDatabase = async () => {
  if (!database) return;
  await database.close();
  initialized = false;
  database = undefined;
};
