/**
 * Generate docket view URL based on environment
 * @param {string} docketId - Base64 encoded docket ID
 * @returns {string} Complete URL for viewing docket
 */
export function generateDocketViewUrl(docketId) {
  const baseUrl = process.env.EPORTAL_URL;
  return `${baseUrl}docket-information/${docketId}`;
}

/**
 * Generate docket access URL
 * @param {string} eCourtUserId - User ID
 * @param {string} tablename - Table name
 * @returns {string} Complete URL for docket access
 */
export function generateDocketAccessUrl(eCourtUserId, tablename) {
  const baseUrl = process.env.EPORTAL_URL;
  return `${baseUrl}docket-access/${eCourtUserId}/${tablename}`;
}

/**
 * Get agency portal base URL
 * @returns {string} Base URL for the agency portal
 */
export function getAgencyPortalBaseUrl() {
  return process.env.AGENCY_PORTAL_URL;
}

/**
 * Generate the agency-user "reset password" link (points at the separate,
 * legacy agency-osah app — not a route in this repo's ecourt-frontend).
 * Matches the legacy PHP link format exactly:
 *   $currentLink/#/resetPassword/$receiver_userId/$current_datetime_email
 * @param {string} receiverUserId - base64(user_uuid)
 * @returns {string} Complete reset-password URL
 */
export function generateAgencyResetPasswordUrl(receiverUserId) {
  const baseUrl = getAgencyPortalBaseUrl();
  const currentDatetimeEmail = Math.floor(Date.now() / 1000);
  return `${baseUrl}reset-password/${receiverUserId}/${currentDatetimeEmail}`;
}
