import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import DOMPurify from 'isomorphic-dompurify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Render HTML email template with data
 * @param {string} templateName - Template file name
 * @param {object} data - Data to inject into template
 * @returns {string} Rendered HTML
 */
function renderTemplate(templateName, data = {}) {
  const templatePath = path.join(__dirname, '../views/emails', templateName);
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace placeholders with sanitized data to prevent XSS
  Object.keys(data).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    const sanitizedValue = DOMPurify.sanitize(data[key] || '');
    template = template.replace(regex, sanitizedValue);
  });

  return template;
}

export { renderTemplate };


