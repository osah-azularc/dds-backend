import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../views/pdf/calendarPdf.ejs');

/**
 * Format a Date or date-string to "MM-DD-YYYY" for display in the PDF header.
 *
 * @param {string|Date|null|undefined} raw - Any value accepted by the Date constructor
 * @returns {string} Formatted date string, or '' for falsy or unparseable input
 */
export function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/**
 * Format a DB time string (e.g. "09:00:00") to 12-hour AM/PM notation (e.g. "9:00 AM").
 *
 * @param {string|null|undefined} raw - Time string from the database
 * @returns {string} Formatted time string, or the original value if input is malformed
 */
export function formatTime(raw) {
  if (!raw || !raw.includes(':')) return raw ?? '';
  const [h, m] = raw.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return raw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Render the calendar PDF HTML for one hearing-time group.
 * Delegates all markup to calendarPdf.ejs; EJS's <%= %> auto-escapes every value,
 * so no manual esc() wrapper is needed here.
 *
 * @param {string}        judgeName   - Pre-formatted judge name (e.g. "Malihi, Michael")
 * @param {string}        county      - County name
 * @param {string}        hearingDate - Pre-formatted date string (e.g. "08-15-2023")
 * @param {string}        hearingTime - Pre-formatted time string (e.g. "9:00 AM")
 * @param {CalendarCase[]} rows       - Deduplicated, sorted case rows from calendarRepository
 * @returns {Promise<string>} Rendered HTML string ready for Puppeteer
 */
export async function buildCalendarHtml({ judgeName, county, hearingSite, hearingDate, hearingTime, rows, pdfTitle }) {
  return ejs.renderFile(TEMPLATE_PATH, { judgeName, county, hearingSite, hearingDate, hearingTime, rows, pdfTitle });
}

