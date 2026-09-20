import { logger } from "../../config/winstonLogger.js";
const getBaseUrl = () => {
  let baseUrl;
  logger.info("CURRNT ENV:", process.env.NODE_ENV);
  switch (process.env.NODE_ENV) {
    case "prod":
      baseUrl = "";
      break;
    case "uat":
      baseUrl = "";
      break;
    case "stag":
      baseUrl = "";
      break;
    case "dev":
      baseUrl = "";
      break;
    case "local":
      baseUrl = "http://localhost:3000";
      break;
  }

  return baseUrl;
};

export default getBaseUrl;
