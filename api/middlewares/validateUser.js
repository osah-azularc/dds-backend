import jwt from "jsonwebtoken";

const validateUser = async (req, res, next) => {
  // Prefer httpOnly cookie (XSS-safe); fall back to Authorization header.
  let token = req.cookies && req.cookies.token;

  if (!token) {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized: Token is missing" });
    }
    const authHeaderParts = authHeader.split(" ");
    if (authHeaderParts.length !== 2 || authHeaderParts[0] !== "Bearer") {
      return res.status(401).json({ message: "Invalid Authorization header" });
    }
    token = authHeaderParts[1];
  }

  jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).json({ message: "Forbidden: Invalid token" });
    }

    req.token = decoded;
    next();
  });
};

export default validateUser;
