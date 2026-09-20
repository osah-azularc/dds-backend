import jwt from "jsonwebtoken";

const sendUnauthorized = (res, message) => {
  return res.status(401).json({
    status: 401,
    title: "Authentication Required",
    message,
    success: false,
  });
};

const resolveUserId = (decoded = {}) => {
  const rawUserId = decoded.user_id ?? decoded.id ?? decoded.userId;
  const normalizedUserId = Number(rawUserId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return null;
  }

  return normalizedUserId;
};

const getLoggedInUserId = async (req, res, next) => {
  // Prefer httpOnly cookie (XSS-safe); fall back to Authorization header.
  let token = req.cookies && req.cookies.token;

  if (!token) {
    const bearerToken = req.headers.authorization;
    if (!bearerToken) {
      return sendUnauthorized(res, "You are not logged in. Please log in to continue.");
    }
    const [scheme, rawToken] = bearerToken.split(" ");
    if (scheme !== "Bearer" || !rawToken) {
      return sendUnauthorized(res, "Authentication token format is invalid.");
    }
    token = rawToken;
  }

  try {
    const decoded = await jwt.verify(token, process.env.TOKEN_SECRET);
    const normalizedUserId = resolveUserId(decoded);

    if (!normalizedUserId) {
      return sendUnauthorized(res, "Authentication token payload is invalid.");
    }

    req.user = decoded;
    req.userId = normalizedUserId;
    req.email = decoded.email;
    next();
  } catch (err) {
    let message = "Unable to authenticate token.";
    if (err.name === "TokenExpiredError") {
      message = "Your session has expired. Please log in again.";
    } else if (err.name === "JsonWebTokenError") {
      message = "Authentication token is invalid.";
    }

    return sendUnauthorized(res, message);
  }
};

export default getLoggedInUserId;
