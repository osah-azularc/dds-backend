import fs from "fs/promises";
import path from "path";
import { Op, Sequelize } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import sendsgMail from "../utilities/sendsgMail.js";
import BulkEmailTemplate from "../models/BulkEmailTemplate.js";
import BulkEmailMapping from "../models/BulkEmailMapping.js";
import AgencyCaseworkerByCase from "../models/AgencyCaseworkerByCase.js";
import PeopleDetails from "../models/PeopleDetails.js";
import AttorneyByCase from "../models/AttorneyByCase.js";
import { deleteFile } from "../../helpers/s3.js";
import { logger } from "../../config/winstonLogger.js";
import { getEfsBasePath } from "../utilities/efsPath.js";

/**
 * Bulk Email Service
 * Business logic for the Bulk Email feature — listing, attachment storage,
 * recipient resolution, and dispatch. Mirrors legacy osah-repos
 * SearchresultController/SearchResult.php bulkEmail() logic.
 * Kept separate from bulkEmailController.js so the controller stays a thin
 * request/response layer.
 */

export const ALLOWED_ORDER_COLUMNS = {
  bulk_email_template_id: "id",
  email_subject: "emailSubject",
  email_body: "emailBody",
  created_date: "createdDate",
  email_status: "emailStatus",
};

// Root directory that attachment paths are written under and read back from.
// Mirrors fileOperationsService.generateApprovedDocumentPath's uploadBaseDir
// exactly: on server envs (dev/stag/uat/prod), only the EFS-mounted volume's
// `upload` subfolder is actually aliased to this app's served `/upload` static
// route (app-ecourt.js) — the rest of `public/` just reflects the deployed
// code checkout and is NOT backed by EFS, so anything written outside
// `public/upload` locally / `EFS_BASE_PATH/upload` on servers is unreachable
// over HTTP and lost on the next redeploy.
const getAttachmentRootDir = () => {
  const nodeEnv = process.env.NODE_ENV;
  if (["dev", "stag", "uat", "prod"].includes(nodeEnv)) {
    const efsBasePath = process.env.EFS_BASE_PATH;
    return path.join(efsBasePath, "upload");
  }
  return path.join(process.cwd(), "public", "upload");
};

/** Resolves a stored `/upload/...` attachment path back to an absolute disk path for this env. */
const resolveAttachmentPath = (relativePath) =>
  path.join(getAttachmentRootDir(), relativePath.replace(/^\/?upload\/?/, ""));

/**
 * Writes an uploaded file to disk under email-attachments/<userId>/<timestamp>/
 * and returns its web-relative path. Mirrors legacy PHP
 * SearchresultController::uploadDocketAttachmentAction() — mkdir + write —
 * but returns a path under `/upload`, this app's actual EFS-backed static
 * route, instead of PHP's DOCUMENT_ROOT-relative "public" path.
 */
export const saveEmailAttachment = async (userId, file) => {
  const timestamp = Math.floor(Date.now() / 1000);
  // Busboy/multer decode multipart filenames as latin1 by default, but browsers
  // send the Content-Disposition filename as UTF-8 bytes — so a non-ASCII name
  // (e.g. "Disposition – Test.docx") arrives byte-mangled ("Disposition â...").
  // Re-decoding those latin1-interpreted bytes back to UTF-8 recovers the
  // original filename. See https://github.com/expressjs/multer/issues/1104.
  const fileName = path.basename(Buffer.from(file.originalname, "latin1").toString("utf8"));

  const addFolder = path.join(
    getEfsBasePath(),
    "email-attachments",
    String(userId),
    String(timestamp),
  );

  await fs.mkdir(addFolder, { recursive: true });
  await fs.writeFile(path.join(addFolder, fileName), file.buffer);

  return ["/file-storage","email-attachments", userId, timestamp, fileName].join("/");
};

/** Reads an attachment's bytes back off disk — PHPMailer's addAttachment() equivalent at send time. */
export const readEmailAttachment = (relativePath) => fs.readFile(resolveAttachmentPath(relativePath));

/**
 * Resolves the attachment for this draft/send request and, if actually sending,
 * its bytes. New upload wins; otherwise removeAttachment clears it; otherwise an
 * existing template keeps its current attachment.
 */
export const resolveOutgoingAttachment = async ({
  uploadedAttachmentPath,
  removeAttachment,
  template,
  actionType,
}) => {
  let emailAttachment = null;
  if (removeAttachment) {
    emailAttachment = null;
  } else if (uploadedAttachmentPath) {
    emailAttachment = uploadedAttachmentPath;
  } else if (template) {
    emailAttachment = template.emailAttachment;
  }

  let attachmentBuffer = null;
  if (emailAttachment && actionType === "sendEmail") {
    try {
      attachmentBuffer = await readEmailAttachment(emailAttachment);
    } catch (error) {
      logger.error("[BulkEmail] Failed to read attachment from disk:", {
        emailAttachment,
        error: error.message,
      });
    }
  }

  return {
    emailAttachment,
    attachmentBuffer,
    attachmentName: emailAttachment ? path.basename(emailAttachment) : null,
  };
};

/** Basic email format validation — mirrors PHP isValidEmail(). */
export const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/**
 * Get unique email recipients for selected dockets from parties_master/case_parties.
 * Raw SQL is required here: those tables have no Sequelize models in this project,
 * and — unlike every other table this service touches — they don't exist at all in
 * the current `osah` schema (verified via `DESCRIBE`/`SHOW TABLES LIKE '%part%'`
 * against the local dev DB), so there is no live schema to model or verify against.
 * Leaving this raw rather than guessing at column definitions for a model that
 * can't be checked.
 */
export const fetchPartyRecipients = (caseIds) => {
  const query = `
    SELECT DISTINCT pm.email_id, pm.party_name, pm.party_type
    FROM parties_master pm
    INNER JOIN case_parties cp ON pm.party_id = cp.party_id
    WHERE cp.case_id IN (:caseIds)
      AND pm.email_id IS NOT NULL AND pm.email_id != '' AND pm.is_deleted = '0'
    ORDER BY pm.party_name
  `;
  return mysqlSequelize.query(query, {
    replacements: { caseIds },
    type: Sequelize.QueryTypes.SELECT,
  });
};

/**
 * Fetch email recipients for given dockets from 3 party tables.
 * Mirrors PHP getBulkEmailDatabySql() exactly — caseid IN, Email != '' AND Email != 'No Email'.
 * Converted from raw SQL to the existing AgencyCaseworkerByCase/PeopleDetails/AttorneyByCase
 * models. `Op.notIn: ['', 'No Email']` reproduces the original's two `!=` conditions
 * (including its NULL-email exclusion, since `NULL NOT IN (...)` is NULL/falsy in MySQL,
 * same as `NULL != ''`). CONCAT(Firstname, ' ', Lastname) returns NULL in MySQL if either
 * part is NULL, so `buildUserName` mirrors that instead of coercing to empty string.
 */
const buildUserName = (firstName, lastName) =>
  firstName == null || lastName == null ? null : `${firstName} ${lastName}`;

export const fetchBulkEmailRecipients = async (docketIds) => {
  if (!docketIds.length) return [];

  const emailFilter = { caseId: { [Op.in]: docketIds }, email: { [Op.notIn]: ["", "No Email"] } };

  const [agency, people, attorneys] = await Promise.all([
    AgencyCaseworkerByCase.findAll({
      where: emailFilter,
      attributes: ["firstName", "lastName", "email", "caseId", "sno"],
    }),
    PeopleDetails.findAll({
      where: emailFilter,
      attributes: ["firstName", "lastName", "email", "caseId", "peopleId"],
    }),
    AttorneyByCase.findAll({
      where: emailFilter,
      attributes: ["firstName", "lastName", "email", "caseId", "sno"],
    }),
  ]);

  return [
    ...agency.map((r) => ({
      Email: r.email,
      userName: buildUserName(r.firstName, r.lastName),
      caseid: r.caseId,
      tableName: "agencycaseworkerbycase",
      party_id: r.sno,
    })),
    ...people.map((r) => ({
      Email: r.email,
      userName: buildUserName(r.firstName, r.lastName),
      caseid: r.caseId,
      tableName: "peopledetails",
      party_id: r.peopleId,
    })),
    ...attorneys.map((r) => ({
      Email: r.email,
      userName: buildUserName(r.firstName, r.lastName),
      caseid: r.caseId,
      tableName: "attorneybycase",
      party_id: r.sno,
    })),
  ];
};

/** Send one email via SendGrid with HTML body and optional buffer attachment. */
const dispatchEmail = async (toEmail, subject, htmlBody, attachmentBuffer, attachmentName) => {
  const attachments = [];
  if (attachmentBuffer && attachmentName) {
    attachments.push({
      content: attachmentBuffer.toString("base64"),
      filename: attachmentName,
      type: "application/octet-stream",
      disposition: "attachment",
    });
  }
  await sendsgMail(toEmail, subject, htmlBody, attachments);
};

/** Send to every valid recipient; returns { sentCount, lastSendError }. */
export const dispatchToRecipients = async (validRecipients, subject, emailMsg, attachmentBuffer, attachmentName) => {
  let sentCount = 0;
  let lastSendError = null;
  for (const recipient of validRecipients) {
    try {
      await dispatchEmail(recipient.Email, subject, emailMsg, attachmentBuffer, attachmentName);
      sentCount++;
    } catch (emailError) {
      lastSendError = emailError.message;
      logger.error(`[BulkEmail] Failed to send to ${recipient.Email}:`, emailError.message);
    }
  }
  return { sentCount, lastSendError };
};

/**
 * Resolves the target docketIds and (if editing) the existing template.
 * When bulkEmailTemplateId is given, re-derives docketIds from that
 * template's existing case mappings; otherwise parses docketIds from the
 * request body (accepts either a real array or a JSON-stringified one).
 * `notFound` is true only when a bulkEmailTemplateId was given but no
 * matching template exists.
 */
export const resolveTemplateAndDocketIds = async (bulkEmailTemplateId, rawDocketIds) => {
  if (bulkEmailTemplateId) {
    const template = await BulkEmailTemplate.findOne({ where: { id: bulkEmailTemplateId } });
    if (!template) {
      return { template: null, docketIds: [], notFound: true };
    }

    const mappings = await BulkEmailMapping.findAll({
      where: { bulkEmailId: template.id },
      attributes: ["caseId"],
    });
    return { template, docketIds: [...new Set(mappings.map((m) => m.caseId))], notFound: false };
  }

  if (Array.isArray(rawDocketIds)) {
    return { template: null, docketIds: rawDocketIds, notFound: false };
  }

  try {
    const docketIds = rawDocketIds ? JSON.parse(rawDocketIds) : [];
    return { template: null, docketIds, notFound: false };
  } catch {
    return { template: null, docketIds: [], notFound: false };
  }
};

/**
 * Creates a new template + case mappings, or updates an existing one in
 * place (editing a saved draft). Returns the saved template.
 */
export const saveTemplateAndMappings = async ({
  template,
  subject,
  emailMsg,
  emailStatus,
  emailAttachment,
  loggedInUserId,
  validRecipients,
  advanceFilters,
}) => {
  const now = new Date();

  if (template) {
    await template.update({
      emailSubject: subject,
      emailBody: emailMsg,
      emailStatus,
      emailAttachment,
      modifiedDate: now,
      modifiedBy: loggedInUserId,
    });
    return template;
  }

  const created = await BulkEmailTemplate.create({
    emailSubject: subject,
    emailBody: emailMsg,
    emailStatus,
    emailAttachment,
    sentBy: loggedInUserId,
    createdDate: now,
    createdBy: loggedInUserId,
    modifiedDate: now,
    modifiedBy: loggedInUserId,
  });

  await BulkEmailMapping.bulkCreate(
    validRecipients.map((r) => ({
      bulkEmailId: created.id,
      caseId: r.caseid,
      emailStatus: 1,
      partyId: r.party_id,
      tableName: r.tableName,
      isDeleted: "0",
      advanceFilters: advanceFilters || null,
      createdDate: now,
    })),
  );

  return created;
};

/**
 * Sends the bulk email to every valid recipient and returns the response
 * body for the endpoint (send-failure or sent-success). Marks the
 * template's sentBy when editing an existing template (bulkEmailTemplateId
 * truthy) after a successful send — newly created templates already get
 * sentBy set at creation time.
 * Returns legacy success codes: 1=sent, 5=all sends failed (draft saved).
 */
export const sendAndBuildResponse = async ({
  template,
  bulkEmailTemplateId,
  validRecipients,
  subject,
  emailMsg,
  attachmentBuffer,
  attachmentName,
  loggedInUserId,
}) => {
  const { sentCount, lastSendError } = await dispatchToRecipients(
    validRecipients,
    subject,
    emailMsg,
    attachmentBuffer,
    attachmentName,
  );
  if (sentCount === 0) {
    logger.error("[BulkEmail] All sends failed. Last error:", lastSendError);
    return { success: 5, bulk_email_template_id: template.id, error: lastSendError };
  }

  if (bulkEmailTemplateId) {
    await template.update({ sentBy: loggedInUserId });
  }
  return { success: 1, bulk_email_template_id: template.id };
};

/**
 * Lists bulk email templates (sent or draft) with pagination/search, each
 * annotated with its recipient case IDs.
 */
export const listBulkEmails = async ({
  condition = "sentEmails",
  limit = 10,
  offset = 0,
  orderby = "created_date",
  order = "DESC",
  searchValue = "",
}) => {
  const orderDirection = order.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const orderColumn = ALLOWED_ORDER_COLUMNS[orderby] || "createdDate";
  const whereClause = { emailStatus: condition === "draftEmails" ? "0" : "1" };

  if (searchValue && String(searchValue).trim() !== "") {
    const searchTerm = `%${String(searchValue).trim()}%`;
    whereClause[Op.or] = [
      { emailSubject: { [Op.like]: searchTerm } },
      { emailBody: { [Op.like]: searchTerm } },
    ];
  }

  const [totalRecords, templates] = await Promise.all([
    BulkEmailTemplate.count({ where: whereClause }),
    BulkEmailTemplate.findAll({
      where: whereClause,
      order: [[orderColumn, orderDirection]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    }),
  ]);

  let bulkEmails = [];
  if (templates.length > 0) {
    const templateIds = templates.map((t) => t.id);
    const mappings = await BulkEmailMapping.findAll({
      where: { bulkEmailId: { [Op.in]: templateIds } },
      attributes: ["bulkEmailId", "caseId"],
    });

    const mappingMap = {};
    mappings.forEach(({ bulkEmailId, caseId }) => {
      if (!mappingMap[bulkEmailId]) mappingMap[bulkEmailId] = new Set();
      mappingMap[bulkEmailId].add(caseId);
    });

    bulkEmails = templates.map((t) => {
      const d = t.toJSON();
      const caseIds = mappingMap[t.id] ? [...mappingMap[t.id]] : [];
      return {
        bulk_email_template_id: d.id,
        email_subject: d.emailSubject,
        email_body: d.emailBody,
        created_date: d.createdDate,
        email_status: d.emailStatus,
        email_attachment: d.emailAttachment,
        sent_by: d.sentBy,
        created_by: d.createdBy,
        modified_date: d.modifiedDate,
        modified_by: d.modifiedBy,
        case_ids: caseIds.join(","),
        total_cases: caseIds.length,
      };
    });
  }

  return {
    bulkEmails,
    pagination: {
      total: totalRecords,
      limit: parseInt(limit),
      offset: parseInt(offset),
      totalPages: Math.ceil(totalRecords / parseInt(limit)),
    },
  };
};

/**
 * Get a bulk email template joined with its case mappings (one row per case),
 * used to populate the view modal when a Sent/Draft Emails list row is clicked.
 * Mirrors the shape of the legacy raw-SQL query
 * (`bulk_email_template.* JOIN bulk_email_mapping AS doc ... GROUP BY doc.caseid`)
 * but is built from Sequelize models instead of raw SQL.
 */
export const getBulkEmailComData = async ({ bulkEmailTemplateId, emailType }) => {
  const isDraft = emailType === "draftEmails";

  // email_status is a MySQL ENUM('0','1') column, not a true TINYINT (despite the model's
  // DataTypes.TINYINT annotation) — comparing it to a number matches by 1-based ENUM index,
  // not by value, so this must stay a string or the lookup silently matches nothing.
  const template = await BulkEmailTemplate.findOne({
    where: { id: bulkEmailTemplateId, emailStatus: isDraft ? "0" : "1" },
  });
  if (!template) return [];

  const mappingWhere = { bulkEmailId: bulkEmailTemplateId };
  if (isDraft) mappingWhere.isDeleted = "0";

  const mappings = await BulkEmailMapping.findAll({ where: mappingWhere, order: [["id", "ASC"]] });

  // One row per case — mirrors the legacy query's `GROUP BY doc.caseid`
  const seenCaseIds = new Set();
  const dedupedMappings = mappings.filter((m) => {
    if (seenCaseIds.has(m.caseId)) return false;
    seenCaseIds.add(m.caseId);
    return true;
  });

  const t = template.toJSON();
  return dedupedMappings.map((mapping) => {
    const d = mapping.toJSON();
    return {
      bulk_email_template_id: String(t.id),
      email_subject: t.emailSubject,
      email_body: t.emailBody,
      email_status: String(t.emailStatus),
      email_attachment: t.emailAttachment,
      sent_by: t.sentBy != null ? String(t.sentBy) : null,
      created_date: t.createdDate,
      created_by: t.createdBy != null ? String(t.createdBy) : null,
      modified_date: t.modifiedDate,
      modified_by: t.modifiedBy != null ? String(t.modifiedBy) : null,
      id: String(d.id),
      bulk_email_id: String(d.bulkEmailId),
      caseid: String(d.caseId),
      party_id: d.partyId != null ? String(d.partyId) : null,
      table_name: d.tableName,
      is_deleted: d.isDeleted,
      advance_filters: d.advanceFilters,
    };
  });
};

/**
 * Deletes a saved bulk email (draft or sent) — removes the template row,
 * its case mappings, and the attachment file (if any). Returns `notFound:
 * true` if no template exists for the given id, otherwise deletes it.
 */
export const deleteBulkEmailTemplate = async (id) => {
  const template = await BulkEmailTemplate.findOne({ where: { id } });
  if (!template) return { notFound: true };

  await BulkEmailMapping.destroy({ where: { bulkEmailId: id } });
  if (template.emailAttachment) {
    await deleteFile(template.emailAttachment);
  }
  await template.destroy();

  return { notFound: false };
};
