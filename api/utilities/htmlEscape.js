/**
 * HTML Escape Utility
 * Provides HTML escaping functionality to prevent XSS attacks in generated content
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {String} str - String to escape
 * @returns {String} - Escaped string with HTML entities
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

