import express from 'express';

import getLoggedInUserId from '../middlewares/getLoggedInUserId.js';
import { getHistoryData } from '../controllers/docketDetail/docketDetailPageHistoryController.js';
import {
  addNote,
  deleteNote,
  getNotes,
  updateNote,
} from '../controllers/docketDetail/docketNotesController.js';

const router = express.Router();

router.post('/getHistoryData', getLoggedInUserId, getHistoryData);
router.post('/notes', getLoggedInUserId, getNotes);
router.post('/add-notes', getLoggedInUserId, addNote);
router.post('/update-notes', getLoggedInUserId, updateNote);
router.post('/delete-notes', getLoggedInUserId, deleteNote);

export default router;
