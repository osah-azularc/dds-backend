import { Op } from "sequelize";
import PublicAccessUser from "../../models/PublicAccessUser.js";
import PeopleDetails from "../../models/PeopleDetails.js";
import AgencyCaseworkerByCase from "../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../models/AttorneyByCase.js";
import NotificationCaseTypesRestriction from '../../models/NotificationCaseTypesRestriction.js';
import sendsgMail from '../../utilities/sendsgMail.js';
import { renderTemplate } from '../../utilities/templateRenderer.js';
import { logger, activityLogger } from '../../../config/winstonLogger.js';
import Notification from '../../models/Notification.js';
import NotificationAction from '../../models/NotificationAction.js';
import DocketNotifications from '../../models/DocketNotifications.js';
import { isExcludedNotificationDocumentType } from '../../helpers/notification/documentAddedNotificationHelper.js';
import ExternalDocuments from '../../models/ExternalDocuments.js';
import Docket from '../../models/Docket.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import { generateDocketViewUrl } from '../../helpers/urlHelper.js';

/**
 * E-Filing Notification Service
 * Handles all email notifications for e-filing operations
 */
class EfilingNotificationService {
  /**
   * Send notifications after document review
   */
  async documentStatusNotifyMail(caseId, params) {
    try {
      const { externalUserId, status, documentName, rejectReason, documentActivity } = params;
      
      // Fetch required data
      const docketInfo = await this.getDocketInfo(caseId);
      if (!docketInfo) {
        return { success: false, message: 'Docket not found' };
      }

      const { cmaPhone, cmaEmail } = await this.getCMAContactInfo(docketInfo.judgeassistant);
      const externalUserInfo = await this.getExternalUserInfo(externalUserId);
      
      if (!externalUserInfo) {
        return { success: false, message: 'External user not found or opted out' };
      }

      const notificationRestricted = await this.checkNotificationRestriction(caseId);
      const docketViewUrl = this.generateDocketViewUrl(caseId);

      // Send appropriate notifications based on status
      if (status === 'Approved') {
        await this.sendApprovalNotifications({
          caseId,
          externalUserId,
          externalUserInfo,
          documentName,
          documentActivity,
          docketViewUrl,
          cmaPhone,
          cmaEmail,
          notificationRestricted
        });
      } else if (status === 'Rejected') {
        await this.sendRejectionNotification(
          externalUserInfo,
          documentName,
          caseId,
          rejectReason,
          documentActivity,
          cmaPhone,
          cmaEmail,
          notificationRestricted
        );
      }

      return { success: true, message: 'Notifications sent successfully' };
    } catch (error) {
      logger.error('Error in documentStatusNotifyMail:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get docket information
   */
  async getDocketInfo(caseId) {
    const docketInfo = await Docket.findOne({
      where: { caseid: caseId },
      attributes: ['judgeassistant', 'casetype', 'refagency'],
      raw: true
    });

    if (!docketInfo) {
      logger.warn(`Docket not found for case ${caseId}`);
      return null;
    }

    return docketInfo;
  }

  /**
   * Get CMA contact information
   */
  async getCMAContactInfo(judgeAssistantName) {
    let cmaPhone = '-';
    let cmaEmail = '';

    if (!judgeAssistantName) {
      return { cmaPhone, cmaEmail };
    }

    const [lastName, firstName] = judgeAssistantName.split(" ");
    
    if (!lastName || !firstName) {
      return { cmaPhone, cmaEmail };
    }

    const cmaData = await JudgeAssistantClerk.findOne({
      where: {
        LastName: lastName,
        FirstName: firstName,
        user_type: 'cma'
      },
      attributes: ['phone', 'email'],
      raw: true
    });

    if (cmaData) {
      cmaPhone = cmaData.phone || '-';
      cmaEmail = cmaData.email || '';
    }

    return { cmaPhone, cmaEmail };
  }

  /**
   * Get external user information
   */
  async getExternalUserInfo(externalUserId) {
    const userInfo = await PublicAccessUser.findOne({
      where: { 
        user_id: externalUserId,
        opt_out_email: '0'
      },
      attributes: ['email', 'firstname', 'lastname'],
      raw: true
    });

    return userInfo;
  }

  /**
   * Send approval notifications to all parties
   */
  async sendApprovalNotifications(params) {
    const {
      caseId,
      externalUserId,
      externalUserInfo,
      documentName,
      documentActivity,
      docketViewUrl,
      cmaPhone,
      cmaEmail,
      notificationRestricted
    } = params;

    const externalUsername = `${externalUserInfo.firstname} ${externalUserInfo.lastname}`;

    // Notify other parties
    const otherPartiesHtmlBody = renderTemplate('documentApproved.html', {
      partyName: 'User',
      documentName,
      caseName: caseId,
      cmaPhone,
      cmaEmail,
      viewDocumentLink: docketViewUrl,
      body: `A new document has been accepted and filed in docket ${caseId}.`
    });

    if (!notificationRestricted) {
      await this.notifyUsersViaMail(caseId, externalUserId, otherPartiesHtmlBody, "OSAH ePortal - A Document Has Been eFiled");
      await this.eServicesNotifyUsersViaMail(caseId, externalUserId, otherPartiesHtmlBody, "OSAH ePortal - A Document Has Been eFiled");
    }

    // Notify submitter with documentActivity
    const submitterHtmlBody = renderTemplate('documentApproved.html', {
      partyName: externalUsername,
      documentName,
      caseName: caseId,
      viewDocumentLink: docketViewUrl,
      body: documentActivity || `Your document "${documentName}" has been accepted and filed in docket ${caseId}.`,
      cmaPhone,
      cmaEmail
    });

    if (!notificationRestricted) {
      await this.sendEmail(externalUsername, externalUserInfo.email, submitterHtmlBody, "OSAH ePortal - Your Document has been eFiled");
    }
  }

  /**
   * Send rejection notification to submitter
   */
  async sendRejectionNotification(
    externalUserInfo,
    documentName,
    caseId,
    rejectReason,
    documentActivity,
    cmaPhone,
    cmaEmail,
    notificationRestricted
  ) {
    const externalUsername = `${externalUserInfo.firstname} ${externalUserInfo.lastname}`;
    
    const rejectedHtmlBody = renderTemplate('documentRejected.html', {
      documentName,
      caseName: caseId,
      body: documentActivity || `Your document "${documentName}" submitted for docket ${caseId} has been rejected.`,
      rejectionReason: rejectReason || 'No reason provided',
      cmaPhone,
      cmaEmail
    });

    if (!notificationRestricted) {
      await this.sendEmail(externalUsername, externalUserInfo.email, rejectedHtmlBody, "OSAH ePortal - Your Document has been Rejected");
    }
  }

  /**
   * Notify all parties on the case (except the submitter)
   */
  async notifyUsersViaMail(caseId, excludeExternalUserId, htmlBody, subject) {
    try {
      const emailList = [];

      const parties = await PeopleDetails.findAll({
        where: { 
          caseid: caseId,
          Email: { [Op.ne]: null },
          [Op.or]: [
            { typeofcontact: 'Petitioner' },
            { typeofcontact: 'Respondent' }
          ]
        },
        attributes: ['Email', 'Firstname', 'Lastname', 'external_userid']
      });

      parties.forEach(party => {
        if (party.external_userid !== excludeExternalUserId && party.Email) {
          emailList.push({
            email: party.Email,
            name: `${party.Firstname} ${party.Lastname}`
          });
        }
      });

      const uniqueEmails = [...new Map(emailList.map(item => [item.email, item])).values()];

      const emailPromises = uniqueEmails.map(recipient => 
        this.sendEmail(recipient.name, recipient.email, htmlBody, subject)
      );

      await Promise.allSettled(emailPromises);

      return { success: true, emailsSent: uniqueEmails.length };
    } catch (error) {
      logger.error('Error in notifyUsersViaMail:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Notify users who opted into eServices
   */
  async eServicesNotifyUsersViaMail(caseId, excludeExternalUserId, htmlBody, subject) {
    try {
      const emailList = [];

      const attorneys = await AttorneyByCase.findAll({
        where: { 
          caseId: caseId,
          eServices: '1',
          email: { [Op.ne]: null }
        },
        attributes: ['email', 'firstname', 'lastname', 'externalUserId']
      });

      attorneys.forEach(attorney => {
        if (attorney.externalUserId !== excludeExternalUserId && attorney.email) {
          emailList.push({
            email: attorney.email,
            name: `${attorney.firstname} ${attorney.lastname}`
          });
        }
      });

      const caseworkers = await AgencyCaseworkerByCase.findAll({
        where: { 
          caseId: caseId,
          eServices: '1',
          email: { [Op.ne]: null }
        },
        attributes: ['email', 'firstname', 'lastname', 'externalUserId']
      });

      caseworkers.forEach(worker => {
        if (worker.externalUserId !== excludeExternalUserId && worker.email) {
          emailList.push({
            email: worker.email,
            name: `${worker.firstname} ${worker.lastname}`
          });
        }
      });

      const uniqueEmails = [...new Map(emailList.map(item => [item.email, item])).values()];

      const emailPromises = uniqueEmails.map(recipient => 
        this.sendEmail(recipient.name, recipient.email, htmlBody, subject)
      );

      await Promise.allSettled(emailPromises);

      return { success: true, emailsSent: uniqueEmails.length };
    } catch (error) {
      logger.error('Error in eServicesNotifyUsersViaMail:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Send individual email using SendGrid
   */
  async sendEmail(recipientName, recipientEmail, htmlBody, subject) {
    try {
      const publicUser = await PublicAccessUser.findOne({
        where: { 
          email: recipientEmail,
          opt_out_email: '0'
        }
      });

      if (!publicUser) {
        logger.info(`User ${recipientEmail} opted out or not found`);
        return { success: false, reason: 'opted_out' };
      }

      await sendsgMail(recipientEmail, subject, htmlBody, [], 'OSAH ePortal');
      activityLogger.info(`Email sent successfully to ${recipientEmail} - Subject: ${subject}`);
      
      return { success: true };
    } catch (error) {
      logger.error(`Error sending email to ${recipientEmail}:`, { error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if case type has notification restrictions
   */
  async checkNotificationRestriction(caseId) {
    try {
      const docketInfo = await Docket.findOne({
        where: { caseid: caseId },
        attributes: ['casetype', 'refagency'],
        raw: true
      });

      if (!docketInfo?.casetype || !docketInfo?.refagency) {
        logger.warn(`Docket info incomplete for case ${caseId}`, docketInfo);
        return 0;
      }

      const restriction = await NotificationCaseTypesRestriction.findOne({
        where: {
          case_type: docketInfo.casetype,
          agency: docketInfo.refagency,
        },
        attributes: ["id"],
      });
      
      return restriction?.id ? 1 : 0;
    } catch (error) {
      logger.error("Error in checkNotificationRestriction:", error);
      return 0;
    }
  }

  /**
   * Generate docket view URL based on environment
   */
  generateDocketViewUrl(caseId) {
    const docketId = Buffer.from(caseId.toString()).toString('base64');
    return generateDocketViewUrl(docketId);
  }

  /**
   * Fan an in-app notification out to every user who is following the docket
   * via the "Notify Me" button (docket_notifications.users_following = '1').
   *
   * The bell feed (notificationHelper.getSystemNotifications) INNER-JOINs
   *   notifications -> notification_action (this user) -> docket_notifications (this user)
   * so a `notifications` row on its own is invisible to a follower until that
   * follower also has a `notification_action` row pointing at it. This seeds one
   * unread/unstarred `notification_action` row per follower.
   *
   * @param {number} notificationId - the notifications.notification_id just created
   * @param {number} caseId         - docket the notification belongs to
   * @param {number} [actorUserId]  - user who triggered it (the approver); skipped
   * @returns {Promise<number>} count of follower action rows created
   */
  async notifyDocketFollowers(notificationId, caseId, actorUserId) {
    if (!notificationId || !caseId) return 0;

    const followers = await DocketNotifications.findAll({
      where: {
        caseId,
        usersFollowing: '1',
        ...(actorUserId ? { userId: { [Op.ne]: actorUserId } } : {}),
      },
      attributes: ['userId'],
      raw: true,
    });

    if (followers.length === 0) return 0;

    // A docket can hold more than one follow row for the same user over time;
    // only seed one action row per user.
    const uniqueUserIds = [...new Set(followers.map((f) => f.userId).filter(Boolean))];
    if (uniqueUserIds.length === 0) return 0;

    const now = new Date();
    await NotificationAction.bulkCreate(
      uniqueUserIds.map((followerUserId) => ({
        notificationId,
        userId: followerUserId,
        isStarred: '0',
        isViewed: '0',
        isEmailSent: '0',
        createdDate: now,
      })),
    );

    logger.info(`Seeded ${uniqueUserIds.length} docket-follower notification(s)`, {
      notificationId,
      caseId,
    });

    return uniqueUserIds.length;
  }

  /**
   * Create notification for approved efiling document
   * Equivalent to PHP's getEfilingDocById
   */
  async createEfilingDocNotification(externalDocId, documentStableId, userId) {
    try {
      // Get document details from external_documents
      const document = await ExternalDocuments.findOne({
        where: { documentId: externalDocId },
        attributes: ['documentId', 'documentType', 'documentName', 'caseId', 'createdBy'],
      });

      if (!document) {
        logger.warn(`Document ${externalDocId} not found for notification`);
        return { success: false, message: 'Document not found' };
      }

      const documentType = document.documentType || 'Document';
      const finalDocId = externalDocId || 0;
      const caseId = document.caseId;

      if (isExcludedNotificationDocumentType(documentType)) {
        logger.info(`Skipping bell notification — excluded document type "${documentType}"`, {
          externalDocId,
          caseId,
        });
        return { success: true, message: 'Document type excluded from notifications', notificationId: null };
      }

      const notificationMsg = `A new ${documentType} has been added.`;

      // Create notification record
      const notification = await Notification.create({
        notificationType: 'document_info',
        actionTrigger: 1,
        notificationMsg: notificationMsg,
        caseId: caseId,
        docId: finalDocId,
        createdDate: new Date(),
        createdBy: userId,
      });

      logger.info(`Notification created for document ${externalDocId}`, {
        notificationId: notification.notificationId,
        caseId: caseId,
        docId: finalDocId,
        documentType: documentType,
      });

      // Make it visible in the bell feed of everyone following this docket
      // ("Notify Me"). Non-fatal: a failure here must not undo the approval or
      // the notification itself.
      try {
        await this.notifyDocketFollowers(notification.notificationId, caseId, userId);
      } catch (fanoutError) {
        logger.error('Failed to fan e-filing notification out to docket followers:', {
          error: fanoutError.message,
          notificationId: notification.notificationId,
          caseId,
        });
      }

      return {
        success: true,
        message: 'Notification created successfully',
        notificationId: notification.notificationId,
      };
    } catch (error) {
      logger.error('Error creating efiling document notification:', {
        error: error.message,
        externalDocId,
        userId,
      });
      throw error;
    }
  }
}

export default new EfilingNotificationService();

