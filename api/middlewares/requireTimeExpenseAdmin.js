/**
 * Restricts a route to users with active-billing access. Scoped explicitly here
 * rather than via validatePermission's /admin req.path prefix sniffing (that check
 * is a no-op for any router mounted below the top-level app, since Express strips
 * the mount prefix from req.path inside a sub-router).
 * Must run after validatePermission — reads req.user, which it already populated.
 * Matches legacy Angular's billing-roles-controller.js: `if (is_active_billing != '1') redirect`
 * — isAdmin is not part of that legacy check, so it isn't part of this one either.
 */
export const requireTimeExpenseAdmin = (req, res, next) => {
  const hasAccess = req.user?.isActiveBilling === '1';

  if (!hasAccess) {
    return res.status(403).json({
      status: 403,
      success: false,
      message: 'You do not have permission to access this feature.',
      data: null,
      error: 'Forbidden',
    });
  }

  next();
};

export default requireTimeExpenseAdmin;
