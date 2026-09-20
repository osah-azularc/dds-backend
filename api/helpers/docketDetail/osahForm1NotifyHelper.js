import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import efilingNotificationService from '../../services/efiling/efilingNotificationService.js';
import { generateDocketViewUrl } from '../urlHelper.js';
import { renderTemplate } from '../../utilities/templateRenderer.js';
import PublicAccessMappingTable from '../../models/PublicAccessMappingTable.js';
import PublicAccessUser from '../../models/PublicAccessUser.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import { logger } from "../../../config/winstonLogger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMAIL_CLOSING = readFileSync(join(__dirname, '../../views/emails/common/emailClosing.html'), 'utf8');

/*
  Created by  : Snehal Narkar
  Date        : 2026-05-28
  Description : ePortal hearing-update notification helper.
                Mirrors PHP notifyUserIfHearingInfoUpdatedAction() in
                OSAHPublicAccessController.php [eportal code] and notifyUsers() in OsahformController.php [ecourt code].
                Called from recordDocketHistory() when any of the 5 trigger fields change.
                Recipient logic mirrors PHP getUserDetailsToNotifyViaMail() in OSAHPublicAccessModel.php:
                  1. publicaccess_mappingtable → publicaccess_users (ePortal case-access users, opt_out='0')
                  2. agencycaseworkerbycase (badge_no) → publicaccess_users by barno
                  3. attorneybycase (AttorneyBar) → publicaccess_users by barno
*/

// Mirrors PHP $docket_trigger label map
const TRIGGER_FIELD_LABEL = {
  hearingTime: 'Hearing time',
  hearingDate: 'Hearing date',
  judge: 'Judge',
  judgeAssistant: "Judge's assistant",
  hearingSite: 'Hearing location',
};

const STYLE_TEXT = "font-family: Roboto, sans-serif; font-size: 16px; font-weight: 300; color: #737c8c; margin: 0;";
const EMAIL_SUBJECT = 'OSAH Hearing Information Update';

// Mirrors PHP: builds the $emailBody paragraph(s) for the 'docket' flag
function buildEmailBody(caseId, changedFields) {
  if (changedFields.length > 1) {
    const items = changedFields
      .map(f => `<li style='${STYLE_TEXT}'>${TRIGGER_FIELD_LABEL[f] ?? f}</li>`)
      .join('');
    return `<p style='${STYLE_TEXT}'>The docket information for your case ${caseId} has been changed.</p><ul>${items}</ul>`;
  }
  const label = (TRIGGER_FIELD_LABEL[changedFields[0]] ?? changedFields[0]).toLowerCase();
  return `<p style='${STYLE_TEXT}'>The ${label} for your case ${caseId} has been changed.</p>`;
}

// Mirrors PHP preg_replace("/^(\d{3})(\d{3})(\d{4})$/", "$1-$2-$3", $phone)
function formatPhone(rawPhone) {
  if (!rawPhone) return '-';
  const digits = String(rawPhone).replaceAll(/\D/g, '');
  return /^\d{10}$/.test(digits) ? digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : rawPhone;
}

// Mirrors PHP getUserDetailsToNotifyViaMail() in OSAHPublicAccessModel.php.
// Returns deduplicated {name, email} list for all ePortal users to notify.
async function getUserDetailsToNotifyViaMail(caseId) {
  const emailMap = new Map();

  // Source 1: publicaccess_mappingtable → publicaccess_users
  const mappings = await PublicAccessMappingTable.findAll({
    where: { caseId },
    attributes: ['userId'],
    raw: true,
  });
  const userIds = mappings.map(m => m.userId);
  const users = userIds.length > 0
    ? await PublicAccessUser.findAll({
        where: { userId: userIds, optOutEmail: '0' },
        attributes: ['firstName', 'lastName', 'email'],
        raw: true,
      })
    : [];
  for (const u of users) {
    if (u.email) emailMap.set(u.email, { name: `${u.firstName} ${u.lastName}`, email: u.email });
  }

  // Source 2: agencycaseworkerbycase (badge_no) → publicaccess_users by barno
  const caseworkers = await AgencyCaseworkerByCase.findAll({
    where: { caseId },
    attributes: ['firstName', 'lastName', 'badgeNo'],
    raw: true,
  });
  for (const cw of caseworkers) {
    if (!cw.badgeNo) continue;
    const user = await PublicAccessUser.findOne({
      where: { barNo: cw.badgeNo, firstName: cw.firstName, lastName: cw.lastName, optOutEmail: '0' },
      attributes: ['firstName', 'lastName', 'email'],
      raw: true,
    });
    if (user?.email) emailMap.set(user.email, { name: `${user.firstName} ${user.lastName}`, email: user.email });
  }

  // Source 3: attorneybycase (AttorneyBar) → publicaccess_users by barno
  const attorneys = await AttorneyByCase.findAll({
    where: { caseId },
    attributes: ['firstName', 'lastName', 'attorneyBar'],
    raw: true,
  });
  for (const atty of attorneys) {
    if (!atty.attorneyBar) continue;
    const user = await PublicAccessUser.findOne({
      where: { barNo: atty.attorneyBar, firstName: atty.firstName, lastName: atty.lastName, optOutEmail: '0' },
      attributes: ['firstName', 'lastName', 'email'],
      raw: true,
    });
    if (user?.email) emailMap.set(user.email, { name: `${user.firstName} ${user.lastName}`, email: user.email });
  }

  return [...emailMap.values()];
}

// Mirrors PHP notifyUserIfHearingInfoUpdatedAction() with flag='disposition'.
// Sends "The decision has been added to your case X." to all eligible ePortal case parties.
// Non-fatal: errors are caught and logged so the disposition save is never blocked.
export async function notifyDispositionAdded(caseId) {
  try {
    const docketInfo = await efilingNotificationService.getDocketInfo(caseId);
    let cmaPhone = '';
    let cmaEmail = '';
    if (docketInfo?.judgeassistant) {
      const contact = await efilingNotificationService.getCMAContactInfo(docketInfo.judgeassistant);
      cmaPhone = formatPhone(contact.cmaPhone);
      cmaEmail = contact.cmaEmail;
    }
    const emailBody = `<p style='${STYLE_TEXT}'>The decision has been added to your case ${caseId}.</p>`;
    const viewDocketLink = generateDocketViewUrl(Buffer.from(String(caseId)).toString('base64'));
    const html = renderTemplate('hearingInfoUpdated.html', { emailClosing: EMAIL_CLOSING, emailBody, viewDocketLink, cmaPhone, cmaEmail });
    const recipients = await getUserDetailsToNotifyViaMail(caseId);
    await Promise.allSettled(
      recipients.map(r => efilingNotificationService.sendEmail(r.name, r.email, html, EMAIL_SUBJECT))
    );
  } catch (err) {
    logger.error('[osahForm1NotifyHelper] notifyDispositionAdded failed for caseId', caseId, err?.message ?? err);
  }
}

// Mirrors PHP notifyUserIfHearingInfoUpdatedAction() in OSAHPublicAccessController.php.
// Builds the hearing-update email and sends it to all eligible ePortal case parties.
// Non-fatal: errors are caught and logged so the docket update is never blocked.
export async function notifyUserIfHearingInfoUpdated(caseId, changedFields) {
  try {
    const docketInfo = await efilingNotificationService.getDocketInfo(caseId);
    // Mirrors PHP: getUserInfo only called if judgeassistant != ''
    let cmaPhone = '';
    let cmaEmail = '';
    if (docketInfo?.judgeassistant) {
      const contact = await efilingNotificationService.getCMAContactInfo(docketInfo.judgeassistant);
      cmaPhone = formatPhone(contact.cmaPhone);
      cmaEmail = contact.cmaEmail;
    }
    const emailBody = buildEmailBody(caseId, changedFields);
    const viewDocketLink = generateDocketViewUrl(Buffer.from(String(caseId)).toString('base64'));
    const html = renderTemplate('hearingInfoUpdated.html', { emailClosing: EMAIL_CLOSING, emailBody, viewDocketLink, cmaPhone, cmaEmail });
    const recipients = await getUserDetailsToNotifyViaMail(caseId);
    await Promise.allSettled(
      recipients.map(r => efilingNotificationService.sendEmail(r.name, r.email, html, EMAIL_SUBJECT))
    );
  } catch (err) {
    // Non-fatal: notification failure must not block the docket update
    logger.error('[osahForm1NotifyHelper] notifyUserIfHearingInfoUpdated failed for caseId', caseId, err?.message ?? err);
  }
}
