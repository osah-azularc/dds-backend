import Form1Summarytable from '../models/Form1Summarytable.js';
import { addHistoryEntry } from './ddsForm1HistoryService.js';
import {
  buildNoteAddedMessage,
  buildNoteUpdatedMessage,
  buildNoteDeletedMessage,
} from '../helpers/ddsHistoryMessageBuilder.js';
import { logger } from '../../config/winstonLogger.js';

const NOTE_SORT_FIELDS = ['date', 'summaryNotes', 'updatedBy'];

// A history-logging failure should never fail the notes action it's describing.
async function logHistorySafely(form1Id, message, modifiedBy) {
  try {
    await addHistoryEntry(form1Id, message, modifiedBy);
  } catch (error) {
    logger.error('Error logging ddshistory entry (dds-form1 notes):', error);
  }
}

/**
 * Notes/Summary list for the existing-docket review screen's Notes tab. Ports
 * DdsForm1Controller's Notes-fetch usage of Osahform::getdatadynamicAction() (a generic
 * raw-SQL `SELECT * FROM tblNm WHERE field_nm <op> field_val` builder against
 * form1_summarytable) as its own dedicated, paginated/sortable Sequelize query -- matches
 * ecourt-frontend's own docketNotesHelper.js's getDocketNotesByCaseId() pattern, keyed by
 * form1Id instead of caseId.
 */
export const getNotesList = async (form1Id, { page, limit, sortBy, sortOrder }) => {
  const sortField = NOTE_SORT_FIELDS.includes(sortBy) ? sortBy : 'date';
  const sortDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await Form1Summarytable.findAndCountAll({
    where: { form1Id },
    order: [
      [sortField, sortDirection],
      ['id', 'DESC'],
    ],
    limit,
    offset: page * limit,
  });

  return {
    result: rows.map((row) => row.toJSON()),
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  };
};

/**
 * Adds or edits a Notes/Summary entry -- one endpoint for both, per the user's request,
 * covering addNotesAction() (no noteId: sets date/updatedBy to today/the current user,
 * matching legacy's session-username + today's date) and updatenotesAction() (noteId
 * given: only summaryNotes changes -- legacy doesn't touch date/updatedby on edit either).
 */
export const saveNote = async ({ form1Id, noteId, summaryNotes, updatedBy }) => {
  if (noteId) {
    const [updatedCount] = await Form1Summarytable.update(
      { summaryNotes },
      { where: { id: noteId, form1Id } },
    );
    if (updatedCount > 0) {
      await logHistorySafely(form1Id, buildNoteUpdatedMessage(summaryNotes), updatedBy);
    }
    return updatedCount > 0;
  }

  await Form1Summarytable.create({ form1Id, date: new Date(), summaryNotes, updatedBy });
  await logHistorySafely(form1Id, buildNoteAddedMessage(summaryNotes), updatedBy);
  return true;
};

/**
 * Deletes a Notes/Summary entry. Ports deletenotesAction() -- a plain hard delete by id
 * (form1_summarytable's `deleted` column is never set by any legacy notes action, so it's
 * left alone here too).
 */
export const deleteNote = async (noteId, modifiedByName) => {
  const noteRow = await Form1Summarytable.findOne({ where: { id: noteId } });
  const deletedCount = await Form1Summarytable.destroy({ where: { id: noteId } });

  if (deletedCount > 0 && noteRow) {
    await logHistorySafely(
      noteRow.form1Id,
      buildNoteDeletedMessage(noteRow.summaryNotes),
      modifiedByName,
    );
  }

  return deletedCount > 0;
};

export default { getNotesList, saveNote, deleteNote };
