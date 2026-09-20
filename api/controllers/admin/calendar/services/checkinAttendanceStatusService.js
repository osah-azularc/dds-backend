// Updates a checked-in docket's attendance_status (0 Hearing Scheduled ->
// 1 Partially Arrived -> 2 Arrived -> 3 Ready for Hearing), guarded by
// "has any party already checked in for this docket today", audited via
// history, and - only when moving to status 3 - notifies the assigned
// judge. Converted from PHP
// OsahCheckInCalenderController::updateAttendanceStatusAction /
// OsahCheckinCalendarModel::updateAttendanceStatus.
//
// The legacy payload sends the entire check-in grid row as
// startCheckinDocketData (~30 fields), but per the legacy trace the model
// only ever reads docket_caseid (guard + update) and hearing_date (guard
// only - the UPDATE's own WHERE always uses the server's current date, not
// the payload's), so that's all this port accepts.
//
// NOTE ON INFERRED BRANCHES: only the success path (status > 0 && some
// party already arrived -> real UPDATE) was traced in full; the three
// non-success outcomes ('partyError' / 'revertPartyError' / 0) were named
// but their exact branch conditions weren't available to consult directly.
// The mapping below is the most semantically consistent reading (blocked
// moving forward vs. blocked reverting vs. no-op) - flag this to confirm
// against the real source if it doesn't match observed legacy behavior.
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import AttendanceStatusTodayDate from "../../../../models/AttendanceStatusTodayDate.js";
import AttendanceStatusMaster from "../../../../models/AttendanceStatusMaster.js";
import JudgeAssistantClerk from "../../../../models/JudgeAssistantClerk.js";
import Notification from "../../../../models/Notification.js";
import { insertDocketHistory } from "../../../../helpers/osahForm1Helper.js";
import { followDocketNotificationHelper } from "../../../../helpers/notification/followDocketHelper.js";
import { actionDocketNotificationService } from "../../../../helpers/notification/notificationDocketHelper.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { todayDateOnly } from "./checkinSharedHelpers.js";
import { assertCheckinRecordIsEditable } from "./checkinGuard.js";
import { logger } from "../../../../../config/winstonLogger.js";

const buildAttendanceHistoryMessage = (previousLabel, newLabel) =>
  '<p class="history-title">Attendance status updated.</p>' +
  `<p><span class="history-label"> Previous Status:</span><span class="history-data">${previousLabel}</span></p>` +
  `<p><span class="history-label"> New Status:</span><span class="history-data">${newLabel}</span></p>`;

// "Ready for Hearing" (status 3) side effect - notify the assigned judge,
// mirroring triggerNotificationOnAttendanceStatusUpdate: create the
// notification row, mark the judge as following this docket, and seed
// their notification_action row. Best-effort: the attendance update and
// its history entry have already committed by the time this runs, so a
// notification failure is logged and swallowed here rather than turning an
// otherwise-successful update into a 500 for the caller.
const notifyJudgeReadyForHearing = async ({ docketCaseId, judgeId, createdBy }) => {
  if (!judgeId) return;

  try {
    // notification_on_off gates whether this judge wants to be notified at
    // all - inferred filter, see file header note.
    const judge = await JudgeAssistantClerk.findOne({
      where: { userId: judgeId, notificationOnOff: "1" },
      attributes: ["userId"],
    });
    if (!judge) return;

    const notification = await Notification.create({
      notificationType: "hearing_info",
      actionTrigger: "1",
      notificationMsg: "Attendance status updated to ready for hearing",
      caseId: docketCaseId,
      createdBy,
    });

    await followDocketNotificationHelper({ caseId: docketCaseId, userId: judgeId, followAction: "1" });
    await actionDocketNotificationService({
      notificationId: notification.notificationId,
      userId: judgeId,
      starredAction: 0,
      viewedAction: 0,
    });
  } catch (error) {
    logger.warn("[notifyJudgeReadyForHearing] failed, attendance update already committed", error);
  }
};

export const updateAttendanceStatus = async ({ startCheckinDocketData, status, modifiedBy }) => {
  const docketCaseId = startCheckinDocketData?.docket_caseid;
  if (!docketCaseId || status === undefined || status === null || status === "") {
    throw new CalendarServiceError(400, "startCheckinDocketData.docket_caseid and status are required");
  }

  const numericStatus = Number(status);
  const payloadHearingDate = startCheckinDocketData.hearing_date;

  const somePartyArrived = Boolean(
    await AttendanceStatusTodayDate.findOne({
      where: { docketCaseId, hearingDate: payloadHearingDate, attendanceStatus: "1" },
      attributes: ["id"],
    }),
  );

  if (!(numericStatus > 0 && somePartyArrived)) {
    if (numericStatus > 0) return { result: "partyError" };
    if (somePartyArrived) return { result: "revertPartyError" };
    return { result: 0 };
  }

  const today = todayDateOnly();
  await assertCheckinRecordIsEditable({ docketCaseId, hearingDate: today });

  const checkinRow = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId, hearingDate: today },
  });
  if (!checkinRow) {
    throw new CalendarServiceError(404, "Check-in record not found for today");
  }

  const previousStatus = checkinRow.attendanceStatus;
  const newStatus = String(numericStatus);
  await checkinRow.update({ attendanceStatus: newStatus, modifiedBy, modifiedDate: new Date() });

  const statusRows = await AttendanceStatusMaster.findAll({ attributes: ["status", "statusName"], raw: true });
  const statusNameByStatus = new Map(statusRows.map((s) => [s.status, s.statusName]));

  await insertDocketHistory(
    String(docketCaseId),
    buildAttendanceHistoryMessage(
      statusNameByStatus.get(previousStatus) ?? previousStatus,
      statusNameByStatus.get(newStatus) ?? newStatus,
    ),
    String(modifiedBy ?? 0),
  );

  if (numericStatus === 3) {
    await notifyJudgeReadyForHearing({ docketCaseId, judgeId: checkinRow.judgeId, createdBy: modifiedBy });
  }

  return { result: 1, docketCaseId, attendanceStatus: newStatus };
};
