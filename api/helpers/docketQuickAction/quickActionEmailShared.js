/**
 * Shared email helper utilities used by both NOH and Continuance email notification helpers.
 * Extracted to avoid duplication — both flows use identical user-lookup and classify logic.
 */

import { Op } from 'sequelize';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import efilingNotificationService from '../../services/efiling/efilingNotificationService.js';
import { generateDocketViewUrl } from '../urlHelper.js';
import NotificationCaseTypesRestriction from '../../models/NotificationCaseTypesRestriction.js';
import PeopleDetails from '../../models/PeopleDetails.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import PublicAccessUser from '../../models/PublicAccessUser.js';
import PublicAccessMappingTable from '../../models/PublicAccessMappingTable.js';

export { efilingNotificationService };
export { logger } from '../../../config/winstonLogger.js';
export { generateDocketViewUrl } from '../urlHelper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EMAIL_CLOSING        = readFileSync(join(__dirname, '../../views/emails/common/emailClosing.html'), 'utf8');
export const EXTERNAL_TEMPLATE    = readFileSync(join(__dirname, '../../views/emails/quickActionEmailExternal.html'), 'utf8');
export const INTERNAL_TEMPLATE    = readFileSync(join(__dirname, '../../views/emails/quickActionEmailInternal.html'), 'utf8');

export function renderTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (html, [key, val]) => html.replaceAll(`{{${key}}}`, val ?? ''),
    template,
  );
}

export async function isNotificationRestricted(agencyCode, casetype) {
  const row = await NotificationCaseTypesRestriction.findOne({
    where: { agency: agencyCode, caseType: casetype },
    attributes: ['id'],
  });
  return row !== null;
}

export async function findByNameAndMapping(firstName, lastName, mappedUserIds) {
  if (mappedUserIds.length === 0) return null;
  return PublicAccessUser.findOne({
    where: { firstName, lastName, optOutEmail: '0', userId: { [Op.in]: mappedUserIds } },
    attributes: ['userId', 'firstName', 'lastName', 'email'],
  });
}

export async function findByBarNo(barNo, firstName, lastName) {
  return PublicAccessUser.findOne({
    where: { barNo, firstName, lastName, optOutEmail: '0' },
    attributes: ['userId', 'firstName', 'lastName', 'email'],
  });
}

export function classifyParty(ePortalUser, { email, externalUserId, userId, fullName, tablename }, ePortalMap, eCourtList) {
  if (ePortalUser?.email) {
    ePortalMap.set(ePortalUser.email, { name: `${ePortalUser.firstName} ${ePortalUser.lastName}`, email: ePortalUser.email });
  } else if (email && email !== 'No Email' && !externalUserId) {
    eCourtList.push({ name: fullName, email, userId, tablename });
  }
}

/**
 * Get all users for a docket split into ePortal (have accounts) and eCourt (email only).
 * Sources: peopledetails, agencycaseworkerbycase, attorneybycase.
 * Mirrors PHP getUsersforEmail in DocumentTemplateFileEmailNotification.php.
 */
export async function getUsersForDocNotification(caseId) {
  const ePortalMap = new Map();
  const eCourtList = [];

  const mappings = await PublicAccessMappingTable.findAll({ where: { caseId }, attributes: ['userId'] });
  const mappedUserIds = mappings.map((m) => m.userId);

  const parties = await PeopleDetails.findAll({
    where: { caseId },
    attributes: ['peopleId', 'firstName', 'lastName', 'email', 'externalUserId'],
  });
  for (const p of parties) {
    const u = await findByNameAndMapping(p.firstName, p.lastName, mappedUserIds);
    classifyParty(u, { email: p.email, externalUserId: p.externalUserId, userId: p.peopleId, fullName: `${p.firstName} ${p.lastName}`, tablename: 'peopledetails' }, ePortalMap, eCourtList);
  }

  const caseworkers = await AgencyCaseworkerByCase.findAll({
    where: { caseId },
    attributes: ['sno', 'firstName', 'lastName', 'email', 'badgeNo', 'externalUserId'],
  });
  for (const cw of caseworkers) {
    const u = cw.badgeNo
      ? await findByBarNo(cw.badgeNo, cw.firstName, cw.lastName)
      : await findByNameAndMapping(cw.firstName, cw.lastName, mappedUserIds);
    classifyParty(u, { email: cw.email, externalUserId: cw.externalUserId, userId: cw.sno, fullName: `${cw.firstName} ${cw.lastName}`, tablename: 'agencycaseworkerbycase' }, ePortalMap, eCourtList);
  }

  const attorneys = await AttorneyByCase.findAll({
    where: { caseId },
    attributes: ['sno', 'firstName', 'lastName', 'email', 'attorneyBar', 'externalUserId'],
  });
  for (const atty of attorneys) {
    const u = atty.attorneyBar
      ? await findByBarNo(atty.attorneyBar, atty.firstName, atty.lastName)
      : await findByNameAndMapping(atty.firstName, atty.lastName, mappedUserIds);
    classifyParty(u, { email: atty.email, externalUserId: atty.externalUserId, userId: atty.sno, fullName: `${atty.firstName} ${atty.lastName}`, tablename: 'attorneybycase' }, ePortalMap, eCourtList);
  }

  return { ePortalUsers: [...ePortalMap.values()], eCourtUsers: eCourtList };
}

/**
 * Get ePortal users for the "A Document Has Been eFiled" email.
 * Mirrors PHP DocumentTemplateFileEmailNotification::getUserDetailsToNotifyViaMail().
 *
 * PHP Email 2 uses a DIFFERENT lookup from Email 1: it starts directly from
 * publicaccess_mappingtable (users who have been granted access to the case),
 * not from party tables. This is why PHP can send Email 2 even when Email 1
 * finds no recipients (e.g. name-matching failure in getUsersforEmail).
 *
 * Sources:
 *   1. publicaccess_mappingtable → publicaccess_users (direct case access grants)
 *   2. agencycaseworkerbycase with badge_no → publicaccess_users by barNo
 *   3. attorneybycase with AttorneyBar → publicaccess_users by barNo
 */
export async function getUsersForDocumentFiledNotification(caseId) {
  const userMap = new Map(); // keyed by email to deduplicate

  // Step 1: all users mapped directly to this case
  const mappings = await PublicAccessMappingTable.findAll({ where: { caseId }, attributes: ['userId'] });
  const mappedUserIds = mappings.map((m) => m.userId);
  if (mappedUserIds.length > 0) {
    const mapped = await PublicAccessUser.findAll({
      where: { userId: { [Op.in]: mappedUserIds }, optOutEmail: '0' },
      attributes: ['firstName', 'lastName', 'email'],
    });
    for (const u of mapped) {
      if (u.email) userMap.set(u.email, { name: `${u.firstName} ${u.lastName}`, email: u.email });
    }
  }

  // Step 2: agency caseworkers linked to ePortal by badge number
  const caseworkers = await AgencyCaseworkerByCase.findAll({
    where: { caseId, badgeNo: { [Op.and]: [{ [Op.ne]: '' }, { [Op.ne]: null }] } },
    attributes: ['firstName', 'lastName', 'badgeNo'],
  });
  for (const cw of caseworkers) {
    const u = await PublicAccessUser.findOne({
      where: { barNo: cw.badgeNo, firstName: cw.firstName, lastName: cw.lastName, optOutEmail: '0' },
      attributes: ['firstName', 'lastName', 'email'],
    });
    if (u?.email) userMap.set(u.email, { name: `${u.firstName} ${u.lastName}`, email: u.email });
  }

  // Step 3: attorneys linked to ePortal by bar number
  const attorneys = await AttorneyByCase.findAll({
    where: { caseId, attorneyBar: { [Op.and]: [{ [Op.ne]: '' }, { [Op.ne]: null }] } },
    attributes: ['firstName', 'lastName', 'attorneyBar'],
  });
  for (const atty of attorneys) {
    const u = await PublicAccessUser.findOne({
      where: { barNo: atty.attorneyBar, firstName: atty.firstName, lastName: atty.lastName, optOutEmail: '0' },
      attributes: ['firstName', 'lastName', 'email'],
    });
    if (u?.email) userMap.set(u.email, { name: `${u.firstName} ${u.lastName}`, email: u.email });
  }

  return [...userMap.values()];
}

/**
 * Send emails to ePortal users (View Docket link) and eCourt users (Login/Create Account links).
 * Uses the shared quickActionEmailExternal/Internal.html templates.
 * bodyMessage  — the action-specific first sentence, e.g. "A notice of hearing has been filed in docket 123."
 * extraVars    — any additional template variables (e.g. { cmaPhone, cmaEmail } for NOH)
 */
export async function sendToParties({ caseId, ePortalUsers, eCourtUsers, subject, bodyMessage, extraVars = {} }) {
  const viewDocketLink = generateDocketViewUrl(Buffer.from(String(caseId)).toString('base64'));
  await Promise.allSettled(
    ePortalUsers.map((u) => {
      const html = renderTemplate(EXTERNAL_TEMPLATE, { emailClosing: EMAIL_CLOSING, caseId, bodyMessage, viewDocketLink, ...extraVars });
      return efilingNotificationService.sendEmail(u.name, u.email, html, subject);
    }),
  );

  const baseUrl = process.env.EPORTAL_URL;
  const caseIdB64 = Buffer.from(String(caseId)).toString('base64');
  await Promise.allSettled(
    eCourtUsers.map((u) => {
      const userIdB64    = Buffer.from(String(u.userId)).toString('base64');
      const tablenameB64 = Buffer.from(u.tablename).toString('base64');
      const loginLink        = `${baseUrl}${caseIdB64}/${userIdB64}/${tablenameB64}`;
      const createAccountLink = `${baseUrl}create-account/${caseIdB64}/${userIdB64}/${tablenameB64}`;
      const html = renderTemplate(INTERNAL_TEMPLATE, { emailClosing: EMAIL_CLOSING, caseId, bodyMessage, loginLink, createAccountLink, ...extraVars });
      return efilingNotificationService.sendEmail(u.name, u.email, html, subject);
    }),
  );
}
