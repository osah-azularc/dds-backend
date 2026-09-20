import SummaryTable from '../../models/SummaryTable.js';

const NOTE_SORT_FIELD_MAP = {
  date: 'date',
  summaryNotes: 'summaryNotes',
  updatedBy: 'updatedBy',
};

function formatLegacyDate(value) {
  if (!value) return '';

  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return String(value);

  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  const year = String(dateValue.getFullYear());
  return `${month}-${day}-${year}`;
}

function mapNoteRowToResponse(note) {
  const row = note?.toJSON ? note.toJSON() : note;

  return {
    noteId:
      row?.id === null || row?.id === undefined
        ? ''
        : String(row.id),
    caseId:
      row?.caseId === null || row?.caseId === undefined
        ? ''
        : String(row.caseId),
    date: formatLegacyDate(row?.date),
    summaryNotes: row?.summaryNotes || '',
    updatedBy: row?.updatedBy || '',
  };
}

export async function getDocketNotesByCaseId(caseId, options = {}) {
  const normalizedPage = Math.max(Number.parseInt(options.page, 10) || 0, 0);
  const normalizedLimit = Math.max(Number.parseInt(options.limit, 10) || 10, 1);
  const normalizedSortBy = NOTE_SORT_FIELD_MAP[options.sortBy] || NOTE_SORT_FIELD_MAP.date;
  const normalizedSortOrder = String(options.sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await SummaryTable.findAndCountAll({
    where: { caseId },
    order: [
      [normalizedSortBy, normalizedSortOrder],
      ['id', 'DESC'],
    ],
    limit: normalizedLimit,
    offset: normalizedPage * normalizedLimit,
  });

  return {
    data: rows.map(mapNoteRowToResponse),
    pagination: {
      total: count,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(count / normalizedLimit),
    },
  };
}

export async function createDocketNote({ caseId, summaryNotes, updatedBy }) {
  await SummaryTable.create({
    caseId,
    docketCaseId: caseId,
    date: new Date(),
    summaryNotes,
    updatedBy,
    deleted: null,
  });

  return 1;
}

export async function updateDocketNoteById({ noteId, summaryNotes }) {
  const note = await SummaryTable.findOne({
    where: {
      id: noteId,
    },
  });

  if (!note) {
    return null;
  }

  await note.update({ summaryNotes });
  return 1;
}

export async function deleteDocketNoteById({ noteId }) {
  const deletedRows = await SummaryTable.destroy({
    where: {
      id: noteId,
    },
  });

  return deletedRows > 0;
}