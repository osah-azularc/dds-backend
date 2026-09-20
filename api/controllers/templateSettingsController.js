import { mysqlSequelize } from "../../connections/seqDB.js";
import {
  getPublicFile,
  deletePublicFile,
  getPublicFileDetailsFromS3,
  uploadPublicFile,
} from "../../helpers/s3public.js";
import { logger } from "../../config/winstonLogger.js";

// import TemplateSettings from "../models/admin/templateSettingsModel.js"; // DELETED - PostgreSQL model
// COMMENTED OUT - Root level PostgreSQL models deleted
// import User from "../models/userModel.js"; // DELETED - PostgreSQL model

export const addCourtSeal = async (req, res) => {
  const { id, imageFileType } = req.body; // Adjusted to match form fields

  if (id == null) {
    id = 1;
  }
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "id must be present" });
  }

  const fileData = req.file;

  let filename = null;
  let courtSeal = "";
  let fileUrl = "";

  // Write the file to aws
  if (fileData) {
    filename = "court_seal_" + Date.now() + "." + imageFileType;

    const uploadResult = await uploadPublicFile(
      fileData.buffer,
      `public-folder/court_seal/${filename}`,
      false,
    );
    if (uploadResult) {
      logger.info("uploadResult = ", uploadResult);
      courtSeal = uploadResult?.key || "";
      fileUrl = uploadResult?.fileUrl || "";
      // return res.status(200).json(profile_pic_url);

      logger.info("courtSeal = ", courtSeal);
    } else {
      return res
        .status(404)
        .json({ success: false, message: "File upload to server failed" });
    }
  }

  const transaction = await mysqlSequelize.transaction();
  try {
    // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
    // const existingRecord = await TemplateSettings.findOne();
    const existingRecord = null; // Placeholder - TemplateSettings model deleted

    let fileNameStr = null;

    if (filename != null && filename?.length != 0) {
      fileNameStr = courtSeal;
    }

    if (existingRecord) {
      // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
      // const [updatedRows] = await TemplateSettings.update(updateData, {
      //   where: { id: existingRecord.id },
      // });
      const updatedRows = 0; // Placeholder - TemplateSettings model deleted
      logger.info("********** Updated Rows = ", updatedRows);
      if (updatedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Court seal update failed" });
      }
      await transaction.commit();
      res.status(200).json({
        success: true,
        message: "courtSeal updated successfully",
        data: fileUrl,
      });
    } else {
      logger.info("********** Inside Else = ");
      try {
        // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
        // const createdRow = await TemplateSettings.create({
        //   official_court_seal: fileNameStr,
        //   created_by: id,
        //   created_date: new Date(),
        //   createdAt: new Date(),
        //   updatedAt: new Date(),
        // });
        await transaction.commit();
        res.status(200).json({
          success: true,
          message: "courtSeal updated successfully",
          data: fileUrl,
        });
      } catch (error) {
        if (error.name === "SequelizeValidationError") {
          logger.error("Validation errors:", error.errors);
          // Handle validation errors here, e.g., send a response with error details
        } else {
          logger.error("Error creating row:", error);
          // Handle other types of errors here
        }
      }
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error,
    });
  }
};

export const getCourtSeal = async (req, res) => {
  try {
    // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
    // let courtSeal = await TemplateSettings.findOne();
    let courtSeal = null; // Placeholder - TemplateSettings model deleted
    if (courtSeal) {
      let fileUrl = null;

      if (courtSeal?.official_court_seal) {
        const { fileUrl: fetchedFileUrl } = await getPublicFileDetailsFromS3(
          courtSeal.official_court_seal,
        );
        fileUrl = fetchedFileUrl;
      }

      return res.status(200).json({
        success: true,
        data: courtSeal,
        url: fileUrl,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Court seal not found",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error,
    });
  }
};

export const getDocument = async (req, res) => {
  try {
    const { key } = req.body;
    if (key) {
      const fileStream = await getPublicFile(key);

      if (fileStream?.pipe) {
        res.attachment(key);
        fileStream.pipe(res);
      } else {
        return res.status(200).json({
          status: 500,
          title: "Unable to fetch document data",
          message:
            "Document data is unable to fetch at this time. Please try again.",
          success: false,
        });
      }
    } else {
      return res.status(200).json({
        status: 500,
        title: "Unable to fetch document data",
        message:
          "Document data is unable to fetch at this time. Please try again.",
        success: false,
      });
    }
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch document data",
      message:
        "Document data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

export const deleteCourtSeal = async (req, res) => {
  try {
    const { id, key } = req.body;
    if (id) {
      // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
      // let courtSealResult = await TemplateSettings.findOne();
      let courtSealResult = null; // Placeholder - TemplateSettings model deleted
      ({
        where: { id: id },
      });
      if (courtSealResult) {
        // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
        // const updateResult = await TemplateSettings.update(updateData, {
        //   where: { id: id },
        // });
        const updateResult = null; // Placeholder - TemplateSettings model deleted

        if (updateResult) {
          // delete file from s3 bucket
          const deleteFileResult = await deletePublicFile(key);
          if (deleteFileResult) {
            return res.status(200).json({
              status: 200,
              message: "Court Seal deleted",
              success: true,
            });
          }
        }
      }
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  }
};

export const getDocumentMetaData = async (req, res) => {
  try {
    const { key } = req.body;
    if (key) {
      const metadata = await getPublicFileDetailsFromS3(key);

      return res.status(200).json({
        status: 200,
        message: "Document metadata fetched successfully",
        data: metadata,
        success: true,
      });
    } else {
      return res.status(200).json({
        status: 500,
        title: "Unable to fetch document metadata",
        message:
          "Document metadata is unable to fetch at this time. Please try again.",
        success: false,
      });
    }
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch document metadata",
      message:
        "Document metadata is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

export const replaceCourtSeal = async (req, res) => {
  const { id, imageFileType, key } = req.body; // Adjusted to match form fields

  if (id == null) {
    id = 1;
  }
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "id must be present" });
  }

  const fileData = req.file;

  let filename = null;
  let courtSeal = "";
  let fileUrl = "";

  // Write the file to aws
  if (fileData) {
    filename = "court_seal_" + Date.now() + "." + imageFileType;

    const uploadResult = await uploadPublicFile(
      fileData.buffer,
      `public-folder/court_seal/${filename}`,
      false,
    );
    if (uploadResult) {
      courtSeal = uploadResult?.key || "";
      fileUrl = uploadResult?.fileUrl || "";
      // return res.status(200).json(profile_pic_url);
    } else {
      return res
        .status(404)
        .json({ success: false, message: "File upload to server failed" });
    }
  }

  const transaction = await mysqlSequelize.transaction();
  try {
    // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
    // const existingRecord = await TemplateSettings.findOne();
    const existingRecord = null; // Placeholder - TemplateSettings model deleted

    let fileNameStr = null;

    if (filename != null && filename?.length != 0) {
      fileNameStr = courtSeal;
    }

    if (existingRecord) {
      // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
      // const [updatedRows] = await TemplateSettings.update(updateData, {
      //   where: { id: existingRecord.id },
      // });
      const updatedRows = 0; // Placeholder - TemplateSettings model deleted
      logger.info("********** Updated Rows = ", updatedRows);
      if (updatedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Court seal update failed" });
      }
      await transaction.commit();

      // delete file from s3 bucket
      const deleteFileResult = await deletePublicFile(key);
      if (deleteFileResult) {
        res.status(200).json({
          success: true,
          message: "courtSeal updated successfully",
          data: fileUrl,
        });
      }
    } else {
      logger.info("********** Inside Else = ");
      try {
        // COMMENTED OUT - TemplateSettings model deleted (PostgreSQL)
        // const createdRow = await TemplateSettings.create({
        //   official_court_seal: fileNameStr,
        //   created_by: id,
        //   created_date: new Date(),
        //   createdAt: new Date(),
        //   updatedAt: new Date(),
        // });
        await transaction.commit();
        res.status(200).json({
          success: true,
          message: "courtSeal updated successfully",
          data: fileUrl,
        });
      } catch (error) {
        if (error.name === "SequelizeValidationError") {
          logger.error("Validation errors:", error.errors);
          // Handle validation errors here, e.g., send a response with error details
        } else {
          logger.error("Error creating row:", error);
          // Handle other types of errors here
        }
      }
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error,
    });
  }
};

export const deleteSignature = async (req, res) => {
  try {
    const { id, key } = req.body;
    if (id) {
      // COMMENTED OUT - User model deleted (PostgreSQL)
      // let signatureResult = await User.findOne();
      let signatureResult = null; // Placeholder - User model deleted
      ({
        where: { id: id },
      });
      if (signatureResult) {
        // COMMENTED OUT - User model deleted (PostgreSQL)
        // const updateResult = await User.update(updateData, {
        //   where: { id: id },
        // });
        const updateResult = null; // Placeholder - User model deleted

        if (updateResult) {
          // delete file from s3 bucket
          const deleteFileResult = await deletePublicFile(key);
          if (deleteFileResult) {
            return res.status(200).json({
              status: 200,
              message: "Signature deleted successfully.",
              success: true,
            });
          }
        }
      }
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  }
};
