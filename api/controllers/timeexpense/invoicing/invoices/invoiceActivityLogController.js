import dayjs from "dayjs";
import InvLog from "../../../../models/timeexpense/invoicing/InvLog.js";
import InvoiceWrittenOff from "../../../../models/timeexpense/invoicing/InvoiceWrittenOff.js";
import InvoiceAttachment from "../../../../models/timeexpense/invoicing/InvoiceAttachment.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import { logger } from "../../../../../config/winstonLogger.js";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 20-08-2026
 * @description
 * Time & Expense > Invoicing > View/Edit Invoice screens' "Invoice Activity" log.
 * Split out of invoiceDetailController.js (which was otherwise pushed over the
 * 300-line file guideline by this endpoint's ext_id enrichment) purely to stay
 * under that guideline - no behavior change.
 */

// inv_logs.action reuses the invoice status codes.
const ACTIVITY_STATUS_LABELS = {
  2: "Draft",
  3: "Paid",
  4: "Overdue",
  5: "Unpaid",
  6: "Partial",
  7: "Written off",
};

/**
 * @description
 * Time & Expense > Invoicing > View Invoice screen: activity/audit log. ext_id
 * means a different thing depending on `action` (invoice_written_off.id for a
 * Write Off entry, invoice_attachments.id for an attachment added/deleted entry,
 * unused otherwise) - not a real foreign key Sequelize can model as one
 * association, so each is looked up separately, only when a log row of that
 * action type is actually present. Matches legacy's getInvoiceActivityLogsAction's
 * own ia/iwo joins - needed to render the activity list's real per-entry
 * sentences/icons (see ViewInvoiceActivityLog.jsx).
 * @param {import('express').Request} req
 * @param {import('express').Response} res - Express response object.
 * @returns {*} { success, data: ({ id, description, action, statusLabel, reason, fileName, fileType, createdAt, createdAtDisplay, creatorFirstName, creatorLastName })[], status }
 */
export const getInvoiceActivityLogs = async (req, res) => {
  try {
    const { id } = req.params;

    const logs = await InvLog.findAll({
      where: { invId: id },
      include: [
        { model: JudgeAssistantClerk, as: "creator", attributes: ["firstName", "lastName"], required: false },
      ],
      order: [["createdAt", "DESC"]],
    });

    const writeOffIds = logs.filter((log) => log.action === 7 && log.extId).map((log) => log.extId);
    // No status filter (unlike getInvoiceAttachments' own active-only list) - a "deleted" (action
    // 12) log entry's attachment is already inactive by the time anyone views this log, but its
    // file name/type still needs to display.
    const attachmentIds = logs
      .filter((log) => [11, 12].includes(log.action) && log.extId)
      .map((log) => log.extId);

    const [writeOffs, attachments] = await Promise.all([
      writeOffIds.length
        ? InvoiceWrittenOff.findAll({ where: { id: writeOffIds }, attributes: ["id", "reason"] })
        : Promise.resolve([]),
      attachmentIds.length
        ? InvoiceAttachment.findAll({
            where: { id: attachmentIds },
            attributes: ["id", "fileName", "fileType"],
          })
        : Promise.resolve([]),
    ]);
    const reasonById = new Map(writeOffs.map((row) => [row.id, row.reason]));
    const attachmentById = new Map(attachments.map((row) => [row.id, row]));

    const data = logs.map((log) => {
      const plain = log.toJSON();
      const attachment = attachmentById.get(plain.extId);
      return {
        id: plain.id,
        description: plain.description,
        action: plain.action,
        statusLabel: ACTIVITY_STATUS_LABELS[plain.action] || null,
        reason: plain.action === 7 ? (reasonById.get(plain.extId) ?? null) : null,
        fileName: attachment?.fileName ?? null,
        fileType: attachment?.fileType ?? null,
        createdAt: plain.createdAt,
        // Formatted here, server-side, from the still-local Date object Sequelize just produced -
        // matches legacy's own architecture (getInvoiceActivityLogsAction's SQL builds
        // month_name/invoice_day/created_time server-side, the template just interpolates them,
        // never re-interpreting through the viewer's own clock). Formatting client-side instead
        // (dayjs(createdAt).format(...) in the browser) would have been timezone-unsafe: createdAt
        // above serializes to JSON as a UTC instant, and dayjs.format() with no plugin renders in
        // the VIEWER's own browser timezone - correct only by coincidence when the viewer happens
        // to share the server's timezone, and silently wrong (unlike legacy, which is identical
        // for every viewer everywhere) the moment it doesn't. See MEMORY.md/session notes,
        // 2026-09-03.
        createdAtDisplay: plain.createdAt ? dayjs(plain.createdAt).format("MMMM D, YYYY [at] hh:mm A") : null,
        creatorFirstName: plain.creator?.firstName ?? null,
        creatorLastName: plain.creator?.lastName ?? null,
      };
    });

    return res.status(200).json({ success: true, data, status: 200 });
  } catch (error) {
    logger.error("Error fetching invoice activity logs:", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to fetch activity logs. Please try again.",
      data: [],
      status: 500,
    });
  }
};
