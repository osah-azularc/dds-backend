import { logger } from "../../config/winstonLogger.js";

const responseLogger = (req, res, next) => {
  const startTime = Date.now();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        url: req.originalUrl,
        statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestBody: req.method !== "GET" ? req.body : undefined,
        responseBody: body,
      };

      if (statusCode >= 500) {
        logger.error(
          `API FAILED [${statusCode}] ${req.method} ${req.originalUrl}`,
          logData,
        );
      } else {
        logger.warn(
          `API WARNING [${statusCode}] ${req.method} ${req.originalUrl}`,
          logData,
        );
      }
    }

    return originalJson(body);
  };

  next();
};

export default responseLogger;
