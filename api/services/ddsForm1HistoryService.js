import DDSHistory from '../models/DDSHistory.js';

const HISTORY_SORT_FIELDS = ['date', 'createdTime', 'description', 'modifiedBy'];

// Matches legacy's own TIME_FORMAT(created_time, '%h:%i %p') display format.
const formatTime12Hour = (value) => {
  if (!value) return '';
  const [hoursStr, minutesStr] = String(value).split(':');
  const hours = Number.parseInt(hoursStr, 10);
  if (Number.isNaN(hours)) return String(value);
  const period = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(twelveHour).padStart(2, '0')}:${minutesStr} ${period}`;
};

/**
 * Audit-trail list for the History tab. Ports
 * DdsForm1Controller::getDdsHistoryDataAction() as a paginated/sortable Sequelize query
 * against ddshistory (this app's own OSAH Docket module's generic `history` table doesn't
 * apply to Form1, unlike ecourt-frontend's own docketHistoryHelper.js, which merges both).
 */
export const getHistoryList = async (form1Id, { page, limit, sortBy, sortOrder }) => {
  const sortField = HISTORY_SORT_FIELDS.includes(sortBy) ? sortBy : 'date';
  const sortDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await DDSHistory.findAndCountAll({
    where: { form1Id },
    order: [
      [sortField, sortDirection],
      ['id', 'DESC'],
    ],
    limit,
    offset: page * limit,
  });

  return {
    result: rows.map((row) => {
      const json = row.toJSON();
      return { ...json, createdTime: formatTime12Hour(json.createdTime) };
    }),
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  };
};

/**
 * Writes one audit-trail row to ddshistory. Ports
 * DdsForm1Controller::addddshistoryAction() -> OsahDbFunctions::addHistory() -- legacy
 * leaves docket_caseid/caseid out of the INSERT for the 'ddshistory' table (its
 * Docket_caseid-from-caseid backfill only applies to the generic 'history' table), relying
 * on the column's own DB-level default; Sequelize requires an explicit value for a NOT
 * NULL column with no declared default, so this passes 0 to match that same effective
 * result. Called by the party/notes/permit services after their own mutations succeed --
 * never awaited by their callers' response, so a history-logging failure never blocks the
 * action it's describing.
 */
export const addHistoryEntry = async (form1Id, message, modifiedBy) => {
  if (!message) return;
  const now = new Date();
  await DDSHistory.create({
    form1Id,
    date: now,
    description: message,
    modifiedBy,
    docketCaseId: 0,
    caseId: 0,
    createdTime: now.toTimeString().slice(0, 8),
  });
};

export default { getHistoryList, addHistoryEntry };
