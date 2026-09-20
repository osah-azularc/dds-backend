import sgMail from '@sendgrid/mail';
import { logger, activityLogger } from '../../config/winstonLogger.js';

/**
 * Send email using SendGrid
 * @param {string}  to            - Recipient email address
 * @param {string}  subject       - Email subject
 * @param {string}  html          - HTML email body
 * @param {Array}   [attachments] - Optional SendGrid attachment objects
 *   Each item: { content: <base64 string>, filename: string, type: string, disposition: 'attachment' }
 * @param {string}  [adminName]   - Optional display name for the email sender
 * @param {string}  [fromEmail]   - Optional sender address override (defaults to EMAIL_FROM) -
 *   e.g. Invoicing's Send Invoice uses its own INVOICE_EMAIL_FROM, a real reply-able billing
 *   contact, instead of the generic no-reply address every other caller sends from.
 * @returns {Promise} SendGrid response
 */
const sendsgMail = async (to, subject, html, attachments = [], adminName = null, fromEmail = null) => {
  try {
    if (!process.env.SENDGRID_API_KEY) throw new Error('SendGrid API key is not configured');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to,
      from: {
        email: fromEmail || process.env.EMAIL_FROM || 'noreply@osah.gov',
        name: adminName || process.env.ADMIN_NAME || 'OSAH Admin',
      },
      subject,
      html,
    };

    if (attachments && attachments.length > 0) {
      msg.attachments = attachments;
    }

    const response = await sgMail.send(msg);
    activityLogger.info(`Email sent successfully to: ${to} - Subject: ${subject}`);
    return response;
  } catch (error) {
    logger.error('Error sending email:', { to, subject, error: error.message, stack: error.stack });
    throw error;
  }
};

export default sendsgMail;
