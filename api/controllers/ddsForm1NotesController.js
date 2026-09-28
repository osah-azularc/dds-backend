import {
  validateGetNotes,
  validateSaveNote,
  validateDeleteNote,
} from '../helpers/ddsForm1NotesValidators.js';
import ddsForm1NotesService from '../services/ddsForm1NotesService.js';
import { resolveUserDisplayName } from '../helpers/resolveUserDisplayName.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Notes/Summary list for the Notes tab.
 * @route POST /dds-form1/get-notes
 */
export const getNotesHandler = async (req, res) => {
  try {
    const { form1Id, page, limit, sortBy, sortOrder } = validateGetNotes(req.body);
    const data = await ddsForm1NotesService.getNotesList(form1Id, { page, limit, sortBy, sortOrder });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in getNotesHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Adds or edits a Notes/Summary entry -- one endpoint for both (noteId absent -> add,
 * present -> edit), per the user's request to consolidate legacy's add-notes/updatenotes.
 * @route POST /dds-form1/savenotes
 */
export const saveNoteHandler = async (req, res) => {
  try {
    const { form1Id, noteId, summaryNotes } = validateSaveNote(req.body);
    const isEdit = Boolean(noteId);
    const success = await ddsForm1NotesService.saveNote({
      form1Id,
      noteId,
      summaryNotes,
      updatedBy: resolveUserDisplayName(req),
    });

    if (!success) {
      return res.status(200).json({ success: false, message: 'Note not found' });
    }

    return res.status(200).json({
      success: true,
      message: isEdit ? 'Notes updated successfully.' : 'Notes added successfully.',
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in saveNoteHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};

/**
 * Deletes a Notes/Summary entry.
 * @route POST /dds-form1/deletenotes
 */
export const deleteNoteHandler = async (req, res) => {
  try {
    const { noteId } = validateDeleteNote(req.body);
    const deleted = await ddsForm1NotesService.deleteNote(noteId, resolveUserDisplayName(req));

    if (!deleted) {
      return res.status(200).json({ success: false, message: 'Note not found' });
    }

    return res.status(200).json({ success: true, message: 'Notes deleted successfully' });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({ success: false, message: 'Validation error', error: error.message });
    }

    logger.error('Error in deleteNoteHandler (dds-form1):', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error', error: 'Internal server error' });
  }
};
