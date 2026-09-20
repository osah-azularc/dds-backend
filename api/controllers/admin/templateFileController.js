import {
  convertDocToPdf,
  cleanupTempFiles,
  uploadDocxFileToScan,
} from "../../../helpers/s3.js";
import { Writable } from "stream";
import { logger } from "../../../config/winstonLogger.js";

export const getTemplateDocument = async (req, res) => {
  try {
    const { key } = req.body;
    if (key) {
      const fileStreamData = await convertDocToPdf(key);

      if (fileStreamData?.streamPdf && fileStreamData?.streamPdf?.pipe) {
        const pdfStream = fileStreamData?.streamPdf;
        res.attachment(key);

        // Step 3: Pipe the PDF stream to the response
        pdfStream.pipe(res);

        pdfStream.on("close", () => {
          cleanupTempFiles(fileStreamData?.tmpDoc, fileStreamData?.tmpPdf);
        });

        pdfStream.on("error", (err) => {
          logger.error("Error streaming PDF:", err);
        });
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

export const getUploadedPDFTemplate = async (req, res) => {
  let fileStreamData; // Declare outside try-catch for cleanup
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Document key is required.",
      });
    }

    // Convert DOC to PDF
    fileStreamData = await convertDocToPdf(key);
    if (!fileStreamData?.streamPdf || !fileStreamData.streamPdf.pipe) {
      return res.status(500).json({
        success: false,
        title: "Unable to fetch document data",
        message:
          "Document data is unable to fetch at this time. Please try again.",
      });
    }

    const pdfStream = fileStreamData.streamPdf;
    const templateSize = fileStreamData.templateSize;

    // Use a writable stream to collect the data from the PDF stream
    const pdfChunks = [];
    const writableStream = new Writable({
      write(chunk, encoding, callback) {
        pdfChunks.push(chunk);
        callback();
      },
    });

    // Pipe the pdfStream into our writable stream
    pdfStream.pipe(writableStream);

    writableStream.on("finish", () => {
      // Combine all chunks into a single buffer
      const pdfBuffer = Buffer.concat(pdfChunks);

      // Convert buffer to Base64 string
      const base64Pdf = pdfBuffer.toString("base64");

      // Send the response to the client
      res.json({
        success: true,
        pdfBase64: base64Pdf,
        templateSize,
        message: "PDF obtained successfully",
      });

      // Cleanup temporary files after sending the response
      if (fileStreamData) {
        cleanupTempFiles(fileStreamData.tmpDoc, fileStreamData.tmpPdf);
      }
    });

    writableStream.on("error", (err) => {
      logger.error("Error collecting PDF stream:", err);
      return res.status(500).json({
        success: false,
        message: "Error processing the PDF stream.",
      });
    });
  } catch (error) {
    logger.error("Error in getTemplateDocument:", error);
    return res.status(500).json({
      success: false,
      title: "Unable to fetch document data",
      message:
        "Document data is unable to fetch at this time. Please try again.",
    });
  }
};

export const uploadDocxTemplate = async (req, res) => {
  try {
    const templateData = req.file;

    if (!templateData) {
      return res
        .status(400)
        .send({ success: false, message: "No file uploaded" });
    }

    // First scan the docx file
    const uploadResult = await uploadDocxFileToScan(templateData.buffer, true);

    if (uploadResult) {
      res.json({
        success: true,
        message: uploadResult,
      });
    } else {
      return res.status(200).json({
        status: 500,
        title: "Unable to upload Template file",
        message:
          "The Template file could not be uploaded at this time. Please try again.",
        success: false,
      });
    }
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      status: 500,
      title: "Unable to upload Template file",
      message:
        "The Template file could not be uploaded at this time. Please try again.",
      success: false,
    });
  }
};

