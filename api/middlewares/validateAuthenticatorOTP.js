import { authenticator } from "otplib";
// COMMENTED OUT - Root level PostgreSQL models deleted
// import User from "../models/userModel.js"; // DELETED - PostgreSQL model

const validateAuthenticatorOTP = async (req, res, next) => {
  const { accesscode } = req.body;

  // COMMENTED OUT - User model deleted (PostgreSQL)
  // const userData = await User.findOne({
  //   where: { email: user },
  // });
  const userData = null; // Placeholder - User model deleted

  const name = userData?.dataValues?.first_name;
  const secret = userData?.dataValues?.TwoFA_Secret;

  const isVerified = authenticator.verify({
    token: accesscode,
    secret: secret,
  });

  if (isVerified) {
    req.body.isVerified = isVerified;
    req.body.name = name;
    next();
  } else {
    res.status(401).json({ message: "Invalid Accessssss Code." });
  }
};

export default validateAuthenticatorOTP;
