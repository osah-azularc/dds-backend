import moment from 'moment';
import ClamavScanStatus from '../../models/ClamavScanStatus.js';
import ExternalDocuments from '../../models/ExternalDocuments.js';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import Notification from '../../models/Notification.js';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { addDocumentHistory } from '../../helpers/docketDetail/documentDataHelper.js';
import efilingNotificationService from '../efiling/efilingNotificationService.js';
import { renderTemplate } from '../../utilities/templateRenderer.js';
import sendsgMail from '../../utilities/sendsgMail.js';
import { logger } from '../../../config/winstonLogger.js';

/**
 * Ports legacy PHP's EfilingController::filescanStatusAction() to Node.
 * Scheduled every 2 minutes via api/cron/clamavScanStatusCron.js.
 *
 * Reads rows the existing (unchanged) Ruby/ClamAV worker already writes to
 * clamav_scan_status and finishes what legacy's manual /efiling/filescanStatus
 * step used to do: flip documentstable.is_scanned, or reject an infected file.
 * Does not touch S3/SQS/ClamAV/Ruby — this only consumes the DB row they leave.
 */

const BATCH_SIZE = 5;
const ECOURT_FILE_ADDED_FROM = '1';
const SCAN_STATUS_CLEAN = '1';
const MALWARE_MESSAGE = 'File scan failed. Malware was detected';

const getPendingRows = () =>
  ClamavScanStatus.findAll({
    where: { updateAction: '0', fileAddedFrom: ECOURT_FILE_ADDED_FROM },
    order: [['id', 'ASC']],
    limit: BATCH_SIZE,
  });

const markProcessed = (rowId) =>
  ClamavScanStatus.update({ updateAction: '1' }, { where: { id: rowId } });

const getCreatorClerk = (createdBy) => JudgeAssistantClerk.findOne({ where: { userId: createdBy } });

// Mirrors legacy's infected-branch email body exactly (EfilingController.php:292-317).
// No existing Node template matches this content — documentRejected.html carries
// different "reason for rejection" framing and a CMA-contact footer legacy's
// malware email never had, so reusing it would alter the wording. Inlined instead.
const buildInfectedEmailHtml = (documentName, caseId) => `<!DOCTYPE html>
<html>
  <head>
    <title>OSAH</title>
    <meta name='viewport' content='width=device-width, initial-scale=1.0, user-scalable=no'>
    <link rel='shortcut icon' href='favicon.ico' type='image/x-icon'>
    <link rel='icon' href='favicon.ico' type='image/x-icon'>
    <link href='https://fonts.googleapis.com/css?family=PT+Serif:400,700|Raleway:300,400,500,700|Roboto:300,400,500,700' rel='stylesheet'>
  </head>
  <body>
    <div style='width: 820px; background: #f1f1f1; padding: 46px 60px 26px 60px; margin: 0 auto; border: 1px solid #d5d7db;'>
      <div style='background: #fff; border: 1px solid #d5d7db;'>
        <div style='padding: 10px 30px;'>
          <a style='display: inline-block;'>
            <img src='https://eportal.osah.ga.gov/external/images/osah-email-logo.jpg' alt='Logo' />
          </a>
        </div>
        <div style='border-top: 1px solid #d5d7db; border-bottom: 1px solid #d5d7db; padding: 30px 30px;'>
          <p style='font-family: Roboto, sans-serif; font-size: 16px; font-weight: 300; color: #737c8c; margin: 0 0 20px 0;'>
            The document '${documentName}' was not submitted to docket ${caseId} as it was found to be malware-infected. Please upload a virus-free document to proceed.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;

async function processCleanRow(row, documentRow) {
  if (documentRow.isScanned !== '1') {
    await mysqlSequelize.transaction(async (transaction) => {
      await DocumentsTable.update(
        { isScanned: '1' },
        { where: { documentId: row.docId }, transaction },
      );

      const description = documentRow.description
        ? `<p><span class="history-label">Description :</span><span class="history-data">${documentRow.description}</p>`
        : '';
      const dateFiledDisplay = documentRow.dateRequested
        ? moment(documentRow.dateRequested).format('MM-DD-YYYY')
        : '';
      const historyMessage =
        `<p class="history-title">A file has been added.</p>` +
        `<p><span class="history-label">File Attachment Name:</span><span class="history-data">${documentRow.documentName}</p>` +
        `<p><span class="history-label">Document Type:</span><span class="history-data">${documentRow.documentType}</p></span></p>` +
        `${description}` +
        `<p><span class="history-label">Date Filed:</span><span class="history-data">${dateFiledDisplay}</p>`;

      const creatorClerk = await getCreatorClerk(row.createdBy);
      const modifiedBy = creatorClerk?.email
        ? creatorClerk.email.split('@')[0]
        : String(documentRow.createdBy);
      await addDocumentHistory(row.caseId, historyMessage, modifiedBy);

      // Base notifications-table insert only — matches the shape already
      // established by efilingNotificationService.createEfilingDocNotification().
      // GAP (see report): legacy's _insertNotiQuery() also looks up
      // notification_action_list for action_trigger and cascades into a
      // follow/action-record subsystem (notification_case_types auto-follow,
      // per-user on/off checks). No Node model/port of that exists; not
      // reproduced here per the "no broad refactor" constraint.
      await Notification.create({
        notificationType: 'document_info',
        actionTrigger: '1',
        notificationMsg: `A new ${documentRow.documentType} has been added.`,
        caseId: row.caseId,
        docId: row.docId,
        createdBy: documentRow.createdBy,
      });
    });
  }

  // Existing "document added/eFiled" email — reuses efilingNotificationService's
  // building blocks exactly as legacy's internalUserDocumentNotification() does
  // (same subject, same documentApproved.html template, same excludeExternalUserId=0
  // call shape). GAP (see report): notifyUsersViaMail()'s recipient query is
  // PeopleDetails Petitioner/Respondent only — narrower than legacy's
  // getUserDetailsToNotifyViaMail (mapped ePortal users + officers + attorneys).
  // Reused as-is rather than widened, per "do not redesign recipients".
  const docketInfo = await efilingNotificationService.getDocketInfo(row.caseId);
  const notificationRestricted = await efilingNotificationService.checkNotificationRestriction(row.caseId);
  if (!notificationRestricted) {
    const { cmaPhone, cmaEmail } = await efilingNotificationService.getCMAContactInfo(
      docketInfo?.judgeassistant,
    );
    const htmlBody = renderTemplate('documentApproved.html', {
      partyName: 'User',
      documentName: documentRow.documentName,
      caseName: row.caseId,
      cmaPhone,
      cmaEmail,
      viewDocumentLink: efilingNotificationService.generateDocketViewUrl(row.caseId),
      body: `A new document has been accepted and filed in docket ${row.caseId}.`,
    });
    await efilingNotificationService.notifyUsersViaMail(
      row.caseId,
      0,
      htmlBody,
      'OSAH ePortal - A Document Has Been eFiled',
    );
  }
}

async function processInfectedRow(row, documentRow) {
  const stillExists = documentRow != null;

  if (stillExists) {
    await mysqlSequelize.transaction(async (transaction) => {
      const timeSubmitted = documentRow.createdDate
        ? moment(documentRow.createdDate).format('HH:mm:ss')
        : null;

      await ExternalDocuments.create(
        {
          caseId: row.caseId,
          documentType: documentRow.documentType,
          description: documentRow.description,
          rejectedReason: MALWARE_MESSAGE,
          formStatusDesc: MALWARE_MESSAGE,
          dateSubmitted: documentRow.dateRequested,
          documentFilePath: `/upload/${row.caseId}/${documentRow.documentType}/${documentRow.documentName}`,
          documentName: documentRow.documentName,
          status: 'Rejected',
          cronAssignedTo: '1',
          isFileScanned: '1',
          isAddedFrom: '1',
          createdBy: documentRow.createdBy,
          modifiedBy: documentRow.createdBy,
          timeSubmitted,
          createdDate: new Date(),
          modifiedDate: new Date(),
        },
        { transaction },
      );

      await AttachmentPathsModel.destroy({ where: { documentId: row.docId }, transaction });
      await DocumentsTable.destroy({ where: { documentId: row.docId }, transaction });
    });
  }

  // Direct send to the document creator, looked up the same way legacy's
  // filescanStatusAction does (getCmaDetails(user_id=created_by)) — NOT
  // efilingNotificationService.sendEmail(), which gates on PublicAccessUser/
  // opt_out_email and would incorrectly skip internal staff. See report.
  const creatorClerk = await getCreatorClerk(row.createdBy);
  if (creatorClerk?.email && documentRow) {
    const recipientName = `${creatorClerk.firstName || ''} ${creatorClerk.lastName || ''}`.trim();
    const htmlBody = buildInfectedEmailHtml(documentRow.documentName, row.caseId);
    await sendsgMail(creatorClerk.email, 'OSAH eCourt - Document Submission Failure', htmlBody, [], recipientName);
  } else {
    logger.warn('clamavScanStatusProcessorService: no clerk email found for infected-scan notification', {
      docId: row.docId,
      createdBy: row.createdBy,
    });
  }
}

async function processRow(row) {
  const documentRow = await DocumentsTable.findOne({ where: { documentId: row.docId } });

  if (row.scanStatus === SCAN_STATUS_CLEAN) {
    if (!documentRow) {
      logger.warn('clamavScanStatusProcessorService: documentstable row missing for clean scan', {
        docId: row.docId,
      });
      return;
    }
    await processCleanRow(row, documentRow);
  } else {
    await processInfectedRow(row, documentRow);
  }

  await markProcessed(row.id);
}

/**
 * Processes up to 5 pending clamav_scan_status rows (file_added_from='1',
 * update_action='0'), oldest first. One row's failure does not prevent
 * already-successful rows from being committed or marked processed — each
 * row is independent, matching legacy's per-row durability (no update_action='1'
 * unless that row's processing actually completed).
 */
export async function processPendingClamavScans() {
  const rows = await getPendingRows();
  const results = { processed: 0, failed: 0, total: rows.length };

  for (const row of rows) {
    try {
      await processRow(row);
      results.processed += 1;
    } catch (error) {
      results.failed += 1;
      logger.error('clamavScanStatusProcessorService: failed to process row', {
        id: row.id,
        docId: row.docId,
        caseId: row.caseId,
        error: error.message,
      });
    }
  }

  return results;
}
