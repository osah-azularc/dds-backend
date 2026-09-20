/**
 * Restricts a route to a fixed set of user_type values (see JudgeAssistantClerk.userType enum:
 * clerk, cma, judge, it, sa, finance, dds_clerk, dds_helpdesk, dds_superuser).
 * Must run after getLoggedInUserId — reads req.user.user_type from the verified JWT payload
 * (authController embeds user_type in the access token at login, so no extra DB lookup is needed).
 */
const requireUserType = (...allowedUserTypes) => (req, res, next) => {
  const userType = req.user?.user_type;

  if (!allowedUserTypes.includes(userType)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this feature.',
      data: null,
      error: 'Forbidden',
    });
  }

  next();
};

export default requireUserType;
