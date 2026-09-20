import { getJsonSecret } from "./secretsManager.js";

let initializationPromise;

const LOCAL_SECRET_ENV_NAMES = [
  "MYSQL_PASSWORD", "TOKEN_SECRET", "REFRESH_TOKEN_SECRET", "USER_SECRET",
  "SESSION_SECRET", "PASS", "SENDGRID_API_KEY",
  "DHS_CSV_S3_ACCESS_KEY", "DHS_CSV_S3_SECRET_KEY", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

const required = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
  return value;
};

const definedString = (value, name) => {
  if (typeof value !== "string") throw new Error(`${name} is required`);
  return value;
};

const numberValue = (value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a valid integer`);
  }
  return parsed;
};

const validateDatabaseSecret = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database secret must be a JSON object");
  }
  if (value.engine !== "mysql") throw new Error("Database secret engine must be mysql");
  return Object.freeze({
    database: required(value.dbname, "Database secret dbname"),
    host: required(value.host, "Database secret host"),
    port: numberValue(value.port, "Database secret port", { min: 1, max: 65535 }),
    username: required(value.username, "Database secret username"),
    password: required(value.password, "Database secret password"),
  });
};

const validateApplicationSecret = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Application secret must be a JSON object");
  }
  const tokenSecret = required(value.TOKEN_SECRET, "Application secret TOKEN_SECRET");
  return Object.freeze({
    ...value,
    TOKEN_SECRET: tokenSecret,
    REFRESH_TOKEN_SECRET: value.REFRESH_TOKEN_SECRET || tokenSecret,
    USER_SECRET: required(value.USER_SECRET, "Application secret USER_SECRET"),
    SESSION_SECRET: required(value.SESSION_SECRET, "Application secret SESSION_SECRET"),
  });
};

const validateEnvironmentConfiguration = () => {
  required(process.env.MYSQL_DATABASE, "MYSQL_DATABASE");
  required(process.env.MYSQL_HOST, "MYSQL_HOST");
  numberValue(process.env.MYSQL_PORT || "3306", "MYSQL_PORT", { min: 1, max: 65535 });
  required(process.env.MYSQL_USERNAME, "MYSQL_USERNAME");
  // MySQL permits accounts with an intentionally blank password in local setups.
  // Require the variable to be present, but do not reject MYSQL_PASSWORD=.
  definedString(process.env.MYSQL_PASSWORD, "MYSQL_PASSWORD");
  const tokenSecret = required(process.env.TOKEN_SECRET, "TOKEN_SECRET");
  process.env.REFRESH_TOKEN_SECRET ||= tokenSecret;
  required(process.env.USER_SECRET, "USER_SECRET");
  required(process.env.SESSION_SECRET, "SESSION_SECRET");
};

const rejectServerSecretFallbacks = () => {
  const configured = LOCAL_SECRET_ENV_NAMES.filter((name) => process.env[name] !== undefined);
  if (configured.length) {
    throw new Error(`Server environment contains local secret variables: ${configured.join(", ")}`);
  }
};

const setEnvironmentValues = (values, source) => {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!["string", "number", "boolean"].includes(typeof value)) {
      throw new Error(`${source} ${name} must be a string, number, or boolean`);
    }
    process.env[name] = String(value);
  }
};

const databaseSecretEnvironmentValues = (value) => {
  const database = validateDatabaseSecret(value);
  return {
    MYSQL_DATABASE: database.database,
    MYSQL_HOST: database.host,
    MYSQL_PORT: database.port,
    MYSQL_USERNAME: database.username,
    MYSQL_PASSWORD: database.password,
  };
};

export const initializeRuntimeConfig = async () => {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const environment = process.env.NODE_ENV || "local";

    if (environment === "local") {
      // Only S3 (user profile file) helpers read this locally; default it rather
      // than hard-failing startup for a var that most local dev never touches.
      process.env.AWS_REGION ||= "us-east-1";
      process.env.APP_PORT ||= "9001";
      numberValue(process.env.APP_PORT, "APP_PORT", { min: 1, max: 65535 });
      validateEnvironmentConfiguration();
      return;
    }

    required(process.env.AWS_REGION, "AWS_REGION");
    rejectServerSecretFallbacks();
    const appSecretId = required(process.env.APP_SECRET_ID, "APP_SECRET_ID");
    const databaseSecretId = required(process.env.DB_SECRET_ID, "DB_SECRET_ID");
    required(process.env.SFTP_SECRET_ID, "SFTP_SECRET_ID");
    const [applicationSecret, databaseSecret] = await Promise.all([
      getJsonSecret(appSecretId), getJsonSecret(databaseSecretId),
    ]);
    process.env={ ...process.env, ...applicationSecret.value };
    required(process.env.EFS_BASE_PATH, "EFS_BASE_PATH");
    required(process.env.DHS_CSV_S3_BUCKET, "DHS_CSV_S3_BUCKET");
    setEnvironmentValues(validateApplicationSecret(applicationSecret.value), "Application secret");
    setEnvironmentValues(databaseSecretEnvironmentValues(databaseSecret.value), "Database secret");
    numberValue(process.env.APP_PORT, "APP_PORT", { min: 1, max: 65535 });
    validateEnvironmentConfiguration();
    console.info("Application and database secrets initialized", {
      applicationSecretId: appSecretId,
      applicationVersionId: applicationSecret.versionId,
      databaseSecretId,
      databaseVersionId: databaseSecret.versionId,
    });
  })();
  try {
    return await initializationPromise;
  } catch (error) {
    initializationPromise = undefined;
    throw error;
  }
};

export const resetRuntimeConfigForTests = () => { initializationPromise = undefined; };
export { validateApplicationSecret, validateDatabaseSecret };
