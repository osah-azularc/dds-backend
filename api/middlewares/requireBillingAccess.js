/**
 * Gate for the Invoicing module. Mirrors legacy InvoicesController/BulkinvoicesController's
 * blanket guard: `if ($session->is_admin == 0 && $session->is_active_billing == 0) { ...401... }`
 * on (almost) every action - any user flagged is_admin or is_active_billing may view, create,
 * send, write off, or delete invoices. No finer-grained split exists in legacy, and per project
 * decision this is being carried over as-is rather than introduced as new resource/action RBAC.
 *
 * Must run after `validatePermission`, which already loads the JudgeAssistantClerk row (with
 * isAdmin / isActiveBilling) onto req.user - no extra DB lookup needed here.
 */
const requireBillingAccess = (req, res, next) => {
  const { isAdmin, isActiveBilling } = req.user || {};

  if (isAdmin !== "1" && isActiveBilling !== "1") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Billing access required.",
    });
  }

  next();
};

export default requireBillingAccess;
