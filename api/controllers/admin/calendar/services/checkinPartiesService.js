// Check-in (and undo check-in) a single party on a docket - powers
// CheckInInfoPage's Case Name / Petitioner Attorney / Respondent Attorney /
// Case Official cells (see checkInInfoColumns.jsx's PARTY_CHECKIN_FIELD_CONFIG).
// Converted from PHP OsahCheckInCalenderController::updateCheckinPartiesAction /
// OsahCheckinCalendarModel::{updateCheckinParties, updatePartyCheckinInBulk,
// updatePartyCheckinWiseAttendanceStatus}.
//
// Legacy flow, in order:
//   1. Resolve partyTypeContact - if the client sent the generic "Case
//      Worker" label (the Case Official cell's click always does, since the
//      grid doesn't know which specific role - Case Worker/Officer/
//      Investigator/... - a given case official actually is), re-derive the
//      real role from the underlying party table via typeofcontact.
//   2. Upsert attendance_status_today_date, keyed by
//      docket_caseid + hearing_date + partyname.
//   3. Only when checking IN (status '1'): cascade the same check-in to
//      this party's other dockets today for the same judge + hearing time
//      (same person can be on multiple dockets in one time slot).
//   4. Recompute *this* docket's checkin_calendar_today_date.attendance_status
//      (0 Hearing Scheduled / 1 Partially Arrived / 2 Arrived) from which of
//      its own parties (case name/petitioner attorney/respondent attorney/
//      case official - whichever are non-empty) have checked in. Note: per
//      the legacy trace this recompute only ever runs for the docket that
//      was clicked, never for the dockets picked up by the bulk cascade in
//      (3) - matched here for fidelity even though it means a bulk-checked-in
//      docket's own status only catches up next time *it's* interacted with.
//   5. Audit via history.
//
// The attendance_status_today_date table as modeled here (see
// AttendanceStatusTodayDate.js) has no party_type_contact/party_type_tablename
// columns, so those aren't persisted (they were legacy columns; the
// resolved partyTypeContact is still used in-memory for the history
// message text).
import { Op } from "sequelize";
import { mysqlSequelize } from "../../../../../connections/seqDB.js";
import CheckinCalendarTodayDate from "../../../../models/CheckinCalendarTodayDate.js";
import AttendanceStatusTodayDate from "../../../../models/AttendanceStatusTodayDate.js";
import TypeOfContact from "../../../../models/TypeOfContact.js";
import AgencyCaseworkerByCase from "../../../../models/AgencyCaseworkerByCase.js";
import AttorneyByCase from "../../../../models/AttorneyByCase.js";
import PeopleDetails from "../../../../models/PeopleDetails.js";
import MinorDetails from "../../../../models/MinorDetails.js";
import { insertDocketHistory } from "../../../../helpers/osahForm1Helper.js";
import { CalendarServiceError } from "./calendarServiceError.js";
import { assertCheckinRecordIsEditable } from "./checkinGuard.js";

const TABLE_MODEL_MAP = {
  agencycaseworkerbycase: AgencyCaseworkerByCase,
  attorneybycase: AttorneyByCase,
  peopledetails: PeopleDetails,
  minordetails: MinorDetails,
};

const nameConcat = (row) => `${row.lastName ?? ""}, ${row.firstName ?? ""}`;

/**
 * Resolves partyTypeContact - if it's the generic "Case Worker" label, looks
 * up the resolved table via typeofcontact and re-derives the real role by
 * matching partyName against that table's "LastName, FirstName" for this
 * case, mirroring the legacy re-resolution. Any other label (Petitioner/
 * Representative/Petitioner Attorney/Respondent Attorney) is trusted as-is,
 * same as legacy.
 */
const resolvePartyTypeContact = async ({ partyTypeContact, docketCaseId, partyName }) => {
  if (partyTypeContact !== "Case Worker") return partyTypeContact;

  const contactType = await TypeOfContact.findOne({
    where: { partyContact: partyTypeContact },
    attributes: ["tableName"],
    raw: true,
  });
  const Model = contactType && TABLE_MODEL_MAP[contactType.tableName];
  if (!Model || !Model.rawAttributes.typeOfContact) return partyTypeContact;

  const rows = await Model.findAll({
    where: { caseId: docketCaseId },
    attributes: ["lastName", "firstName", "typeOfContact"],
    raw: true,
  });
  const match = rows.find((row) => nameConcat(row) === partyName);
  return match?.typeOfContact || partyTypeContact;
};

const upsertPartyAttendance = async (
  { docketCaseId, hearingDate, hearingTime, partyName, status, modifiedBy },
  transaction,
) => {
  const existing = await AttendanceStatusTodayDate.findOne({
    where: { docketCaseId, hearingDate, partyName },
    transaction,
  });

  if (existing) {
    await existing.update(
      { hearingTime, attendanceStatus: status, modifiedBy, modifiedDate: new Date() },
      { transaction },
    );
  } else {
    await AttendanceStatusTodayDate.create(
      {
        docketCaseId,
        hearingDate,
        hearingTime,
        partyName,
        attendanceStatus: status,
        createdBy: modifiedBy,
        createdDate: new Date(),
      },
      { transaction },
    );
  }
};

/**
 * Finds this same party (by name) across the judge's other dockets today at
 * the same hearing time - whichever of their case name/petitioner attorney/
 * respondent attorney/case official columns holds that name - and checks
 * them in too. Only called when checking IN, matching legacy (the cascade
 * never fires on undo).
 */
const cascadeBulkCheckin = async (
  { docketCaseId, hearingDate, hearingTime, judgeId, partyName, modifiedBy },
  transaction,
) => {
  if (!judgeId || !hearingTime) return 0;

  const matches = await CheckinCalendarTodayDate.findAll({
    where: {
      judgeId,
      hearingDate,
      hearingTime,
      startCheckin: "1",
      docketCaseId: { [Op.ne]: docketCaseId },
      [Op.or]: [
        { caseName: partyName },
        { petitionerAttorney: partyName },
        { respondentAttorney: partyName },
        { caseOfficial: partyName },
      ],
    },
    attributes: ["docketCaseId"],
    raw: true,
    transaction,
  });

  for (const match of matches) {
    await upsertPartyAttendance(
      { docketCaseId: match.docketCaseId, hearingDate, hearingTime, partyName, status: "1", modifiedBy },
      transaction,
    );
  }

  return matches.length;
};

/**
 * Recomputes this docket's checkin_calendar_today_date.attendance_status
 * from which of its own non-empty parties (case name/petitioner attorney/
 * respondent attorney/case official) have a checked-in
 * attendance_status_today_date row - none => 0, all => 2, some => 1.
 * A no-op if the docket has no listed parties at all, or the computed value
 * matches what's already stored.
 */
const recomputeDocketAttendanceStatus = async ({ docketCaseId, hearingDate, modifiedBy }, transaction) => {
  const checkinRow = await CheckinCalendarTodayDate.findOne({
    where: { docketCaseId, hearingDate },
    transaction,
  });
  if (!checkinRow) return;

  const requiredParties = [
    checkinRow.caseName,
    checkinRow.petitionerAttorney,
    checkinRow.respondentAttorney,
    checkinRow.caseOfficial,
  ]
    .map((value) => (value || "").trim())
    .filter(Boolean);
  if (!requiredParties.length) return;

  const checkedInRows = await AttendanceStatusTodayDate.findAll({
    where: { docketCaseId, hearingDate, attendanceStatus: "1" },
    attributes: ["partyName"],
    raw: true,
    transaction,
  });
  const checkedInNames = new Set(checkedInRows.map((row) => (row.partyName || "").trim()));
  const checkedInCount = requiredParties.filter((name) => checkedInNames.has(name)).length;

  let newStatus;
  if (checkedInCount === 0) newStatus = "0";
  else if (checkedInCount === requiredParties.length) newStatus = "2";
  else newStatus = "1";

  if (newStatus === checkinRow.attendanceStatus) return;
  await checkinRow.update({ attendanceStatus: newStatus, modifiedBy, modifiedDate: new Date() }, { transaction });
};

const STATUS_LABEL = { 1: "Check-in", 0: "Undo Check-in" };

const buildCheckinHistoryMessage = ({ partyName, partyTypeContact, status }) =>
  '<p class="history-title">Start checked-in party information updated.</p>' +
  `<p><span class="history-label"> Name:</span><span class="history-data">${partyName}</span></p>` +
  `<p><span class="history-label"> Contact Type:</span><span class="history-data">${partyTypeContact}</span></p>` +
  `<p><span class="history-label"> Status:</span><span class="history-data">${STATUS_LABEL[status] ?? status}</span></p>`;

export const updateCheckinParties = async ({
  startCheckinDocketData,
  partyName,
  partyTypeContact,
  status,
  modifiedBy,
}) => {
  const docketCaseId = startCheckinDocketData?.docket_caseid;
  const hearingDate = startCheckinDocketData?.hearing_date;
  const hearingTime = startCheckinDocketData?.hearing_time;
  const judgeId = startCheckinDocketData?.judge_id;

  if (!docketCaseId || !hearingDate || !partyName) {
    throw new CalendarServiceError(
      400,
      "startCheckinDocketData.docket_caseid, startCheckinDocketData.hearing_date and partyName are required",
    );
  }

  await assertCheckinRecordIsEditable({ docketCaseId, hearingDate });

  const numericStatus = String(status) === "1" ? "1" : "0";
  const resolvedPartyTypeContact = await resolvePartyTypeContact({
    partyTypeContact,
    docketCaseId,
    partyName,
  });

  const transaction = await mysqlSequelize.transaction();
  let bulkCheckedInCount = 0;

  try {
    await upsertPartyAttendance(
      { docketCaseId, hearingDate, hearingTime, partyName, status: numericStatus, modifiedBy },
      transaction,
    );

    if (numericStatus === "1") {
      bulkCheckedInCount = await cascadeBulkCheckin(
        { docketCaseId, hearingDate, hearingTime, judgeId, partyName, modifiedBy },
        transaction,
      );
    }

    await recomputeDocketAttendanceStatus({ docketCaseId, hearingDate, modifiedBy }, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await insertDocketHistory(
    String(docketCaseId),
    buildCheckinHistoryMessage({ partyName, partyTypeContact: resolvedPartyTypeContact, status: numericStatus }),
    String(modifiedBy ?? 0),
  );

  return {
    docketCaseId,
    partyName,
    partyTypeContact: resolvedPartyTypeContact,
    status: numericStatus,
    bulkCheckedInCount,
  };
};
