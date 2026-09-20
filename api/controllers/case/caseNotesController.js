// COMMENTED OUT - Notes model deleted (PostgreSQL)
// import Notes from "../../models/case/notesModel.js"; // DELETED - PostgreSQL model
// import User from "../../models/userModel.js"; // DELETED - PostgreSQL model
import { Sequelize } from "sequelize";
import { validateCaseNote } from "../../../helpers/caseValidation.js";
import moment from "moment";
import { logger } from "../../../config/winstonLogger.js";

export const getCaseNotes = async (req, res) => {
  try {
    const { case_id, page, limit } = req.body;
    const offset = (page - 1) * limit;

    if (!case_id || case_id === "" || case_id === 0) {
      return res.status(200).json({
        status: 500,
        title: "Unable to fetch notes",
        message:
          "The notes could not be fetched at this time. Please try again.",
        success: false,
      });
    }

    // COMMENTED OUT - Notes model deleted (PostgreSQL)
    // const notes = await Notes.findAll({
    //   where: { case_id: case_id },
    //   attributes: [
    //     "id",
    //     "case_id",
    //     "note",
    //     "created_by",
    //     [
    //       Sequelize.literal(
    //         "CASE WHEN notes.updated_by IS NOT NULL THEN CONCAT(note_updated_by_user.first_name, ' ', note_updated_by_user.last_name) ELSE CONCAT(note_created_by_user.first_name, ' ', note_created_by_user.last_name) END",
    //       ),
    //       "author_name",
    //     ],
    //     "updatedAt",
    //   ],
    //   order: [["updatedAt", "DESC"]],
    //   offset,
    //   limit: parseInt(limit, 10),
    //   include: [
    //     {
    //       model: User,
    //       as: "note_created_by_user",
    //       attributes: [],
    //     },
    //     {
    //       model: User,
    //       as: "note_updated_by_user",
    //       attributes: [],
    //     },
    //   ],
    // });
    const notes = []; // Placeholder - Notes model deleted

    const now = moment();
    const startOfThisWeek = now.clone().startOf("isoWeek"); // (Sunday - Saturday)
    const startOfThisMonth = now.clone().startOf("month");

    let groupedNotes = {
      thisWeek: [],
      thisMonth: [],
    };

    let noOfNotes = 0;
    notes.forEach((note) => {
      const updatedAt = moment(note.updatedAt);
      if (updatedAt.isSameOrAfter(startOfThisWeek)) {
        groupedNotes.thisWeek.push(note);
      } else if (updatedAt.isSameOrAfter(startOfThisMonth)) {
        groupedNotes.thisMonth.push(note);
      } else {
        const monthYearKey = updatedAt.format("MMMM-YYYY");
        if (!groupedNotes[monthYearKey]) {
          groupedNotes[monthYearKey] = [];
        }
        groupedNotes[monthYearKey].push(note);
      }
      noOfNotes++;
    });

    // Convert the object into an array of entries
    let entries = Object.entries(groupedNotes);

    // Sort the array by date in descending order
    entries.sort((a, b) => new Date(b[0]) - new Date(a[0]));

    // Convert the array back into an object
    groupedNotes = Object.fromEntries(entries);

    return res.status(200).json({
      status: 200,
      message: "Notes data fetched successfully",
      data: groupedNotes,
      total: noOfNotes,
      success: true,
    });
  } catch (error) {
    logger.error("Error", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch notes",
      message: "The notes could not be fetched at this time. Please try again",
      success: false,
    });
  }
};

export const createCaseNote = async (req, res) => {
  const { case_id, note } = req.body;
  const user_id = req.userId;
  try {
    const validationErrors = validateCaseNote(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to add note",
        message: validationErrors,
        success: false,
      });
    }

    const caseNoteData = {
      case_id: case_id,
      note: note,
      created_by: user_id,
      created_date: new Date(),
    };

    // COMMENTED OUT - Notes model deleted (PostgreSQL)
    // const caseNotesResult = await Notes.create(caseNoteData);
    const caseNotesResult = null; // Placeholder - Notes model deleted
    if (caseNotesResult) {
      return res.status(200).json({
        status: 200,
        message: "Note added",
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to add note",
      message: "Note could not be added. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error("Error", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to create case",
      message: "The case could not be created at this time. Please try again.",
      success: false,
    });
  }
};

export const updateCaseNote = async (req, res) => {
  const { id, note } = req.body;
  const user_id = req.userId;
  try {
    const validationErrors = validateCaseNote(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to update note",
        message: validationErrors,
        success: false,
      });
    }

    const caseNoteData = {
      note: note,
      updated_by: user_id,
      updated_date: new Date(),
    };

    // COMMENTED OUT - Notes model deleted (PostgreSQL)
    // const caseNotesResult = await Notes.update(caseNoteData, {
    //   where: { id: id },
    // });
    const caseNotesResult = null; // Placeholder - Notes model deleted
    if (caseNotesResult) {
      return res.status(200).json({
        status: 200,
        message: "Note updated",
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to update note",
      message: "Note could not be updated. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error("Error", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to update note",
      message: "The note could not be updated at this time. Please try again.",
      success: false,
    });
  }
};

export const deleteCaseNote = async (req, res) => {
  const { id } = req.body;
  try {
    // COMMENTED OUT - Notes model deleted (PostgreSQL)
    // const caseNotesResult = await Notes.destroy({
    //   where: { id: id },
    // });
    const caseNotesResult = null; // Placeholder - Notes model deleted
    if (caseNotesResult) {
      return res.status(200).json({
        status: 200,
        message: "Note deleted",
        success: true,
      });
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to delete note",
      message: "Note could not be deleted. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error("Error", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to delete note",
      message: "The note could not be deleted at this time. Please try again.",
      success: false,
    });
  }
};
