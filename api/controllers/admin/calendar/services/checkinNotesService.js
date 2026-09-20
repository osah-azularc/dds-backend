// Saves the Notes field edited from CheckInInfoPage's "Editing" panel
// (Save Changes button) - a direct UPDATE of
// checkin_calendar_today_date.notes/modified_date/modified_by, plus an
// audit entry in history, reusing the same insertDocketHistory helper
// checkinStartCheckinService.js already uses for "check-in started"
// entries (history table: Docket_caseid/caseid/Description/Modifiedby/
// created_time/date - see History.js).
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import { insertDocketHistory } from "../../../../helpers/osahForm1Helper.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { assertCheckinRecordIsEditable } from "./checkinGuard.js";

const buildNotesHistoryMessage = (notes) =>
  '<p class="history-title">Check-in notes updated.</p>' +
  `<p><span class="history-label"> Notes:</span><span class="history-data">${notes || ""}</span></p>`;

export const saveCheckinNotes = async ({ id, notes, modifiedBy }) => {
  if (!id) {
    throw new CalendarServiceError(400, "id is required");
  }

  const checkinRow = await CheckinCalendarTodayDate.findByPk(id);
  if (!checkinRow) {
    throw new CalendarServiceError(404, "Check-in record not found");
  }

  await assertCheckinRecordIsEditable({
    docketCaseId: checkinRow.docketCaseId,
    hearingDate: checkinRow.hearingDate,
  });

  await checkinRow.update({
    notes: notes ?? null,
    modifiedBy,
    modifiedDate: new Date(),
  });

  await insertDocketHistory(
    String(checkinRow.docketCaseId),
    buildNotesHistoryMessage(notes),
    String(modifiedBy ?? 0),
  );

  return {
    id: checkinRow.id,
    docketCaseId: checkinRow.docketCaseId,
    notes: checkinRow.notes,
  };
};
