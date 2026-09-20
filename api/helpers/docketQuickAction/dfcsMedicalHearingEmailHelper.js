/*
  Description : DFCS-M "NOTICE OF HEARING - MEDICAL ASSISTANCE" email.
                Mirrors PHP OsahDbDocumentTemplate::sendElectronicMail() (line 2455).
                Called from nohQuickActionHelper when agencyCode === 'DFCS-M' after NOH generation.
                Sends to Petitioner, Petitioner Attorney, and Representative only.
                Also inserts a history entry per recipient (mirrors PHP addHistory call).
*/

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op } from 'sequelize';
import moment from 'moment';
import { localNow } from '../timeUtils.js';
import { logger } from '../../../config/winstonLogger.js';
import Docket from '../../models/Docket.js';
import CourtLocations from '../../models/CourtLocations.js';
import PeopleDetails from '../../models/PeopleDetails.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';
import History from '../../models/History.js';
import sendsgMail from '../../utilities/sendsgMail.js';
import { renderTemplate } from './quickActionEmailShared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDICAL_HEARING_TEMPLATE = readFileSync(join(__dirname, '../../views/emails/dfcsMedicalHearingEmail.html'), 'utf8');

// PHP: only these party types receive the medical hearing email for DFCS-M
const DFCSM_EMAIL_PARTY_TYPES = ['Petitioner', 'Petitioner Attorney', 'Representative'];

async function insertMedicalHearingHistory(caseId, recipientEmail, username) {
  const now = localNow();
  const description =
    '<p class="history-title">OSAH: Electronic hearing notice for Medicaid has been sent:</p>' +
    `<p><span class="history-label">Email Address:</span><span class="history-data">${recipientEmail}</span></p>`;
  await History.create({
    caseId,
    docketCaseId: caseId,
    description,
    modifiedBy: username || '',
    date: now.format('YYYY-MM-DD'),
    createdTime: now.format('HH:mm:ss'),
  });
}

/**
 * Send DFCS-M "NOTICE OF HEARING - MEDICAL ASSISTANCE" email after NOH generation.
 * Mirrors PHP OsahDbDocumentTemplate::sendElectronicMail() — only called when agency='DFCS-M'.
 *
 * Recipients: Petitioner, Petitioner Attorney, Representative from peopledetails +
 *             agencycaseworkerbycase + attorneybycase filtered to those party types.
 * Each valid email address also gets a history entry per PHP's addHistory call.
 *
 * Non-fatal: errors are caught and logged so NOH generation is never blocked.
 *
 * @param {number} caseId
 * @param {string} newHearingDate  YYYY-MM-DD
 * @param {string} newHearingTime  HH:mm or HH:mm:ss
 * @param {string} username        Display name for history entry
 */
export async function sendDFCSMedicalHearingEmail(caseId, newHearingDate, newHearingTime, username) {
  try {
    // Fetch docket to get hearingsite name
    const docket = await Docket.findOne({
      attributes: ['hearingSite'],
      where: { caseId },
      raw: true,
    });
    const locationName = docket?.hearingSite || '';

    // Fetch address from courtlocations by location name (mirrors PHP hearinglocation query)
    let location = null;
    if (locationName) {
      location = await CourtLocations.findOne({
        attributes: ['address1', 'address2', 'city', 'state', 'zip'],
        where: { locationName },
        raw: true,
      });
    }

    // Collect recipients: peopledetails + agencycaseworkerbycase + attorneybycase
    // filtered to DFCSM_EMAIL_PARTY_TYPES, mirrors PHP sendElectronicMail $whereCondition
    const [people, caseworkers, attorneys] = await Promise.all([
      PeopleDetails.findAll({
        attributes: ['firstName', 'lastName', 'email', 'typeOfContact'],
        where: { caseId, typeOfContact: { [Op.in]: DFCSM_EMAIL_PARTY_TYPES } },
        raw: true,
      }),
      AgencyCaseworkerByCase.findAll({
        attributes: ['firstName', 'lastName', 'email', 'typeOfContact'],
        where: { caseId, typeOfContact: { [Op.in]: DFCSM_EMAIL_PARTY_TYPES } },
        raw: true,
      }),
      AttorneyByCase.findAll({
        attributes: ['firstName', 'lastName', 'email', 'typeOfContact'],
        where: { caseId, typeOfContact: { [Op.in]: DFCSM_EMAIL_PARTY_TYPES } },
        raw: true,
      }),
    ]);

    const allParties = [...people, ...caseworkers, ...attorneys];
    if (allParties.length === 0) return;

    const formattedDate = newHearingDate
      ? moment(newHearingDate, ['YYYY-MM-DD', 'MM-DD-YYYY']).format('MMMM D, YYYY')
      : '';
    const formattedTime = newHearingTime
      ? moment(newHearingTime, 'HH:mm:ss').format('h:mm A')
      : '';
    const addr2 = location?.address2 ? `${location.address2}<br/>` : '';

    const emailHtml = renderTemplate(MEDICAL_HEARING_TEMPLATE, {
      formattedDate,
      formattedTime,
      locationName,
      address1: location?.address1 || '',
      addr2,
      city:  location?.city  || '',
      state: location?.state || '',
      zip:   location?.zip   || '',
    });

    const subject = `Notice of Hearing - Medical Assistance for docket #${caseId}`;

    // Send email + history per recipient (mirrors PHP per-party loop)
    for (const party of allParties) {
      const email = party.email || party.Email || '';
      // Bounded quantifiers (RFC 5321 local-part/domain limits) keep worst-case
      // backtracking cost constant regardless of the input string's length.
      if (!email || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,24}$/.test(email)) continue;

      try {
        await sendsgMail(email, subject, emailHtml, [], 'OSAH ePortal');
        await insertMedicalHearingHistory(caseId, email, username);
      } catch (err) {
        logger.error(`[DFCSMEmail] Failed for caseId=${caseId}, email=${email}:`, err?.message ?? err);
      }
    }

    logger.info(`[DFCSMEmail] Medical hearing email sent for caseId=${caseId} to ${allParties.length} parties`);
  } catch (err) {
    logger.error(`[DFCSMEmail] sendDFCSMedicalHearingEmail failed for caseId=${caseId}:`, err?.message ?? err);
  }
}
