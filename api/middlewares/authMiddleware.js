import jwt from "jsonwebtoken";

const getRequestToken = (req) => {
  let token = req.cookies && req.cookies.token;

  if (!token) {
    const bearerToken = req.headers.authorization || req.header("Authorization");
    if (!bearerToken) {
      return { error: "Authentication token is missing." };
    }

    const [scheme, rawToken] = bearerToken.split(" ");
    if (scheme !== "Bearer" || !rawToken) {
      return { error: "Token is not in 'Bearer <token>' format." };
    }

    token = rawToken;
  }

  return { token };
};

const verifyToken = (token) => {
  try {
    return { decoded: jwt.verify(token, process.env.TOKEN_SECRET) };
  } catch (error) {
    let message = "Unable to authenticate token.";

    if (error.name === "TokenExpiredError") {
      message = "Token has expired.";
    } else if (error.name === "JsonWebTokenError") {
      message = "Token is invalid.";
    }

    return { error: message };
  }
};

export const extractAndVerifyToken = (req, res) => {
  const { token, error: tokenError } = getRequestToken(req);
  if (tokenError) {
    res.status(401).json({ message: tokenError });
    return null;
  }

  const { decoded, error: verifyError } = verifyToken(token);
  if (verifyError) {
    res.status(401).json({ message: verifyError });
    return null;
  }

  return decoded;
};

export const requireAuth = (req, res, next) => {
  const decoded = extractAndVerifyToken(req, res);
  if (!decoded) {
    return null;
  }

  req.user = decoded;
  req.userId = decoded?.user_id ?? decoded?.id ?? decoded?.userId ?? null;
  req.email = decoded?.email ?? null;

  return next();
};

export default requireAuth;
