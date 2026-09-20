import {
  createDocketNote,
  deleteDocketNoteById,
  getDocketNotesByCaseId,
  updateDocketNoteById,
} from '../../helpers/docketDetail/docketNotesHelper.js';
import { logger } from "../../../config/winstonLogger.js";

function resolveUpdatedBy(req) {
  const rawIdentity = String(req.email || req.user?.username || 'system').trim();
  if (!rawIdentity) return 'system';
  return rawIdentity.split('@')[0] || 'system';
}

export async function getNotes(req, res) {
  try {
    const caseId = Number.parseInt(String(req.body.caseId), 10);
    const notesResult = await getDocketNotesByCaseId(caseId, {
      page: req.body.page,
      limit: req.body.limit,
      sortBy: req.body.sortBy,
      sortOrder: req.body.sortOrder,
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: notesResult.data.length ? 'Notes fetched successfully' : 'No notes found',
      data: {
        result: notesResult.data,
        pagination: notesResult.pagination,
      },
      error: null,
    });
  } catch (error) {
    logger.error('Error fetching docket notes:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to fetch notes',
      data: {
        result: [],
        pagination: {
          total: 0,
          page: 0,
          limit: 10,
          totalPages: 0,
        },
      },
      error: error.message,
    });
  }
}

export async function addNote(req, res) {
  try {
    const caseId = Number.parseInt(String(req.body.caseId), 10);
    const createdNoteResult = await createDocketNote({
      caseId,
      summaryNotes: req.body.summaryNotes,
      updatedBy: resolveUpdatedBy(req),
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Note added successfully',
      data: { result: String(createdNoteResult) },
      error: null,
    });
  } catch (error) {
    logger.error('Error adding docket note:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to add note',
      data: null,
      error: error.message,
    });
  }
}

export async function updateNote(req, res) {
  try {
    const noteId = Number.parseInt(String(req.body.noteId), 10);
    const updatedNoteResult = await updateDocketNoteById({
      noteId,
      summaryNotes: req.body.summaryNotes,
    });

    if (!updatedNoteResult) {
      return res.status(200).json({
        status: 200,
        success: false,
        message: 'Note not found',
        data: null,
        error: 'Note not found',
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Note updated successfully',
      data: { result: String(updatedNoteResult) },
      error: null,
    });
  } catch (error) {
    logger.error('Error updating docket note:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to update note',
      data: null,
      error: error.message,
    });
  }
}

export async function deleteNote(req, res) {
  try {
    const noteId = Number.parseInt(String(req.body.noteId), 10);
    const deleted = await deleteDocketNoteById({ noteId });

    if (!deleted) {
      return res.status(200).json({
        status: 200,
        success: false,
        message: 'Note not found',
        data: null,
        error: 'Note not found',
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Note deleted successfully',
      data: { result: 'true' },
      error: null,
    });
  } catch (error) {
    logger.error('Error deleting docket note:', error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to delete note',
      data: null,
      error: error.message,
    });
  }
}