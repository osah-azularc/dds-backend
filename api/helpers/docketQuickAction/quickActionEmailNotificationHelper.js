import {
  logger,
  efilingNotificationService,
  isNotificationRestricted,
  getUsersForDocNotification,
  getUsersForDocumentFiledNotification,
  sendToParties,
} from './quickActionEmailShared.js';

// Mirror PHP preg_replace("/^(\d{3})(\d{3})(\d{4})$/", "$1-$2-$3", $phone)
function formatPhone(rawPhone) {
  if (!rawPhone) return '-';
  const digits = String(rawPhone).replaceAll(/\D/g, '');
  return /^\d{10}$/.test(digits) ? digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : rawPhone;
}

async function sendDocEmailNotification(caseId, agencyCode, casetype, { subject, bodyMessage, logTag, alsoSendDocumentFiled = false }) {
  try {
    const restricted = await isNotificationRestricted(agencyCode, casetype);
    if (restricted) {
      logger.info(`[${logTag}] Notification restricted for caseId=${caseId} (agency=${agencyCode}, casetype=${casetype})`);
      return;
    }

    const docketInfo = await efilingNotificationService.getDocketInfo(caseId);
    let cmaPhone = '-';
    let cmaEmail = '';
    if (docketInfo?.judgeassistant) {
      const contact = await efilingNotificationService.getCMAContactInfo(docketInfo.judgeassistant);
      cmaPhone = formatPhone(contact?.cmaPhone);
      cmaEmail = contact?.cmaEmail || '';
    }

    const { eCourtUsers } = await getUsersForDocNotification(caseId);
    const extraVars = { cmaPhone, cmaEmail };

    // Email 1: sent to eCourt (email-only) users only.
    // PHP notifyExternalUsers() is broken — $ePortal is a nested array so $data['email']
    // resolves to null and no email is delivered to ePortal users. Matching that behavior:
    // ePortal users receive only Email 2 ("A Document Has Been eFiled") via the mapping table.
    await sendToParties({ caseId, ePortalUsers: [], eCourtUsers, subject, bodyMessage, extraVars });

    // Email 2: mirrors PHP generateDocumentTemplate → internalUserDocumentNotification
    // Uses a DIFFERENT user lookup (publicaccess_mappingtable directly) — mirrors PHP
    // getUserDetailsToNotifyViaMail, which differs from getUsersforEmail used for Email 1.
    if (alsoSendDocumentFiled) {
      const docFiledUsers = await getUsersForDocumentFiledNotification(caseId);
      if (docFiledUsers.length > 0) {
        await sendToParties({
          caseId, ePortalUsers: docFiledUsers, eCourtUsers: [],
          subject:     'OSAH ePortal - A Document Has Been eFiled',
          bodyMessage: `A new document has been accepted and filed in docket ${caseId}.`,
          extraVars,
        });
      }
    }

    logger.info(`[${logTag}] Notifications sent for caseId=${caseId}: ${ePortalUsers.length} ePortal, ${eCourtUsers.length} eCourt`);
  } catch (err) {
    logger.error(`[${logTag}] failed for caseId=${caseId}:`, err?.message ?? err);
  }
}

/**
 * Send NOH email notifications to all eligible parties.
 * Mirrors PHP NOHAutomation flow which sends TWO separate emails:
 *   1. sendDocTemplateEmailNotification(flag='noh') → "A Notice of Hearing Has Been eFiled"
 *      → to both ePortal (external) and eCourt (internal) users
 *   2. internalUserDocumentNotification → "A Document Has Been eFiled"
 *      → to ePortal (external) users only
 * Skip: agencyCode='DFCS'|'CSS', casetype='EST', or in restriction table.
 */
export async function sendNOHDocEmailNotification(caseId, agencyCode, casetype) {
  const upperAgency = String(agencyCode).toUpperCase();
  if (upperAgency === 'DFCS' || upperAgency === 'CSS' || String(casetype).toUpperCase() === 'EST') {
    logger.info(`[NOHEmail] Skipping notification for caseId=${caseId} (agency=${agencyCode}, casetype=${casetype})`);
    return;
  }
  try {
    const restricted = await isNotificationRestricted(agencyCode, casetype);
    if (restricted) {
      logger.info(`[NOHEmail] Notification restricted for caseId=${caseId} (agency=${agencyCode}, casetype=${casetype})`);
      return;
    }

    const docketInfo = await efilingNotificationService.getDocketInfo(caseId);
    let cmaPhone = '-';
    let cmaEmail = '';
    if (docketInfo?.judgeassistant) {
      const contact = await efilingNotificationService.getCMAContactInfo(docketInfo.judgeassistant);
      cmaPhone = formatPhone(contact?.cmaPhone);
      cmaEmail = contact?.cmaEmail || '';
    }

    const { eCourtUsers } = await getUsersForDocNotification(caseId);
    const extraVars = { cmaPhone, cmaEmail };

    // Email 1: eCourt users only — see sendDocEmailNotification comment for why ePortal is excluded.
    await sendToParties({
      caseId, ePortalUsers: [], eCourtUsers,
      subject:     'OSAH ePortal - A Notice of Hearing Has Been eFiled',
      bodyMessage: `A notice of hearing has been filed in docket ${caseId}.`,
      extraVars,
    });

    // Email 2: mirrors PHP generateDocumentTemplate → internalUserDocumentNotification
    // Uses a DIFFERENT user lookup (publicaccess_mappingtable directly) — mirrors PHP
    // getUserDetailsToNotifyViaMail, which differs from getUsersforEmail used for Email 1.
    const docFiledUsers = await getUsersForDocumentFiledNotification(caseId);
    if (docFiledUsers.length > 0) {
      await sendToParties({
        caseId, ePortalUsers: docFiledUsers, eCourtUsers: [],
        subject:     'OSAH ePortal - A Document Has Been eFiled',
        bodyMessage: `A new document has been accepted and filed in docket ${caseId}.`,
        extraVars,
      });
    }

    logger.info(`[NOHEmail] Notifications sent for caseId=${caseId}: ${ePortalUsers.length} ePortal, ${eCourtUsers.length} eCourt`);
  } catch (err) {
    logger.error(`[NOHEmail] failed for caseId=${caseId}:`, err?.message ?? err);
  }
}

/**
 * Send Continuance email notifications to all eligible parties.
 * Mirrors PHP continuanceAutomation flow which sends TWO separate emails:
 *   1. sendDocTemplateEmailNotification(flag='continuance') → "A Continuance Has Been eFiled"
 *      → to both ePortal (external) and eCourt (internal) users
 *   2. generateDocumentTemplate → internalUserDocumentNotification → "A Document Has Been eFiled"
 *      → to ePortal (external) users only
 */
export async function sendContinuanceEmailNotification(caseId, agencyCode, casetype) {
  await sendDocEmailNotification(caseId, agencyCode, casetype, {
    subject:               'OSAH ePortal - A Continuance Has Been eFiled',
    bodyMessage:           `A continuance has been filed in docket ${caseId}.`,
    logTag:                'ContinuanceEmail',
    alsoSendDocumentFiled: true,
  });
}

/**
 * Send Disposition email notifications to all eligible parties.
 * Mirrors PHP dispositionAutomation flow which sends TWO separate emails:
 *   1. sendDocTemplateEmailNotification(flag='decision') → "A Decision Has Been eFiled"
 *      → to both ePortal (external) and eCourt (internal) users
 *   2. generateDocumentTemplate → internalUserDocumentNotification → "A Document Has Been eFiled"
 *      → to ePortal (external) users only
 */
export async function sendDispositionEmailNotification(caseId, agencyCode, casetype) {
  await sendDocEmailNotification(caseId, agencyCode, casetype, {
    subject:               'OSAH ePortal - A Decision Has Been eFiled',
    bodyMessage:           `A decision has been filed in docket ${caseId}.`,
    logTag:                'DispositionEmail',
    alsoSendDocumentFiled: true,
  });
}
