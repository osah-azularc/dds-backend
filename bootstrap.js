import { readFile } from "node:fs/promises";
import { parse } from "dotenv";

const LOCAL_NPM_LIFECYCLES = new Set([
  "local", "local:debug", "localhost", "mac", "linux-local", "linux-local:debug",
]);

const SERVER_ENV_NAMES = [
  "NODE_ENV", "AWS_REGION", "APP_SECRET_ID", "DB_SECRET_ID", "SFTP_SECRET_ID",
];

const readEnvironmentFile = async () => {
  try {
    return parse(await readFile(new URL(".env", import.meta.url)));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
};

const loadEnvironment = async () => {
  const localLifecycle = LOCAL_NPM_LIFECYCLES.has(process.env.npm_lifecycle_event);
  if (process.env.NODE_ENV === "local" || localLifecycle) {
    process.env.NODE_ENV = "local";
    await import("dotenv/config");
    return;
  }

  const environmentFile = await readEnvironmentFile();
  if (!process.env.NODE_ENV && environmentFile.NODE_ENV !== "local") {
    process.env.NODE_ENV = environmentFile.NODE_ENV || "local";
  }

  if (process.env.NODE_ENV === "local") {
    await import("dotenv/config");
    return;
  }

  for (const name of SERVER_ENV_NAMES) {
    if (process.env[name] === undefined && environmentFile[name] !== undefined) {
      process.env[name] = environmentFile[name];
    }
  }
};

const start = async () => {
  await loadEnvironment();
  const { initializeRuntimeConfig } = await import("./config/runtimeConfig.js");
  const { initializeDatabase, closeDatabase } = await import("./connections/seqDB.js");
  const { stopDatabaseCredentialRefresh } = await import("./connections/databaseCredentialManager.js");

  await initializeRuntimeConfig();
  await initializeDatabase();
  const { startApplication } = await import("./app-ecourt.js");
  const application = await startApplication();
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("Shutting down eCourt", { signal });
    try {
      await application.close();
      stopDatabaseCredentialRefresh();
      await closeDatabase();
    } catch (error) {
      console.error("Shutdown failed", { category: error?.name || "shutdown-error" });
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((error) => {
  console.error("eCourt startup failed", {
    category: error?.category || error?.name || "startup-error",
    message: error?.message || "startup failed",
  });
  process.exitCode = 1;
});
