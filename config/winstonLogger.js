import path from "node:path";
import { fileURLToPath } from "node:url";

import winston from "winston";
const { format } = winston;
import DailyRotateFile from "winston-daily-rotate-file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define base directory for logs
const logsDir = path.join(__dirname, "..", "logs");

// Create a new logger instance
const logger = winston.createLogger({
  level: "info",
  format: format.combine(
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  ),
  defaultMeta: { service: "ecourt-backend" },
  transports: [
    new winston.transports.Console(), // Log to console
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }), // Log errors to a file
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }), // Log all other messages to a different file
  ],
});

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level.toUpperCase()}: ${message}`;
    const metaKeys = Object.keys(meta).filter((k) => k !== "service");
    if (metaKeys.length) {
      const metaObj = Object.fromEntries(metaKeys.map((k) => [k, meta[k]]));
      log += `\n${JSON.stringify(metaObj, null, 2)}`;
    }
    return log;
  }),
);

// Create a transport to log errors to daily rotating file
const errorTransport = new DailyRotateFile({
  filename: path.join(logsDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxFiles: "30d", // Rotate logs daily, keep logs for 30 days
});

// Create a Winston logger instance
const activityLogger = winston.createLogger({
  level: "error",
  format: logFormat,
  transports: [
    errorTransport, // Add the error transport
    new winston.transports.Console({
      format: logFormat,
    }),
  ],
});

/**
 * Global Winston error logger utility.
 *
 * Logs:
 * - API endpoint
 * - Timestamp
 * - Error message
 * - Minimal request metadata
 *
 * Usage:
 * logError({
 *   error,
 *   req,
 *   customMessage: "Create user failed",
 *   extra: {
 *     userId: req.body?.userId,
 *   },
 * });
 */
const logError = ({ error, req = null, customMessage = "", extra = {} }) => {
  try {
    const timestamp = new Date().toISOString();

    const endpoint = `${req?.method || "UNKNOWN"} ${req?.originalUrl || ""}`;

    const errorMessage = `[${timestamp}] ${endpoint} - ${
      customMessage || "API Error"
    } | ${error?.message || "Unexpected Error"}`;

    activityLogger.error(errorMessage, {
      method: req?.method,
      url: req?.originalUrl,
      ip: req?.ip,
      ...(req?.method !== "GET" && {
        requestBody: req?.body,
      }),
      errorMessage: error?.message,
      ...extra,
    });
  } catch (loggerError) {
    console.error("Winston Logger Error:", loggerError);
  }
};

export { logger, activityLogger, logError };
