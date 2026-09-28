/**
 * Resolves the logged-in user's display name for ddshistory.modifiedby /
 * form1_summarytable.updatedby -- legacy stamps these with the session's
 * username; this JWT carries firstName/lastName instead (see
 * authController.js's tokenData), so "First Last" is used, falling back to
 * the email's local part.
 */
export function resolveUserDisplayName(req) {
  const { firstName, lastName } = req.user || {};
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return (req.email || 'system').split('@')[0];
}
