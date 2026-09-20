/**
 * @file userAuthController.js
 * @description Compatibility barrel for user auth handlers.
 */

export {
  verifyEmail,
} from "./userAuthAccountController.js";

export {
  twoFaValidate,
  fetchSignedUpUsers,
  logoutUser,
  loginUser,
} from "./userAuthSessionController.js";


