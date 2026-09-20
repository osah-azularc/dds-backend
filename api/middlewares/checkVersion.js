import { version } from "../../config/version.js";
import { setCookie } from "../utilities/setSessionCookie.js";
import { logger } from "../../config/winstonLogger.js";

export const checkVersion = async (app) => {
  app.use(async (req, res, next) => {
    try {
      if (version) setCookie(res, "appVersion", version); //Added by FaisalK
      next();
    } catch (error) {
      logger.error("error", error);
      return res.status(500).json({
        message: error,
        status: false,
      });
    }
  });
};
