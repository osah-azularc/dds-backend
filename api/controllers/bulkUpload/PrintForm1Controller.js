import path from 'node:path';
import fsSync from 'node:fs';
import archiver from 'archiver';
import { printForm1 } from '../../services/bulkUpload/printForm1Service.js';
import { getStorageRoot } from '../../services/bulkUpload/printForm1Helpers.js';
import { logger } from '../../../config/winstonLogger.js';

// Guards that the id segment is a plain millisecond timestamp — prevents path traversal.
const isValidTimestamp = (id) => /^\d{13}$/.test(id);

/**
 * POST /api/bulk-upload/form1/print
 *
 * Body: { data: { datereceivedbyOSAH?, refagency?, caseid? } }
 *
 * Queries all open ALS cases matching the filters, generates a DDS Form 1 PDF
 * for each, stages them in a timestamped zip folder, and returns the folder ID
 * so the client can call the download endpoint next.
 *
 * Legacy: OsahformController::printosahformAction()
 */
export const printForm1Handler = async (req, res) => {
  try {
    const params = req.body?.data || {};
    const userId = req.userId;
    const userEmail = req.email;

    const timestamp = await printForm1(params, userId, userEmail);

    if (!timestamp) {
      return res.status(200).json({
        status: 200,
        success: false,
        message: 'No open ALS cases found matching the provided filters.',
        data: null,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: 'DDS Form 1 PDFs generated successfully.',
      data: { zipFolder: String(timestamp) },
    });
  } catch (error) {
    logger.error('Print Form1: printForm1Handler error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to generate DDS Form 1 PDFs. Please try again.',
      data: null,
    });
  }
};

/**
 * GET /api/bulk-upload/form1/download-zip/:id
 *
 * Streams the staged PDF folder as a ZIP file to the client.
 * The :id must be the 13-digit millisecond timestamp returned by printForm1Handler.
 *
 * Legacy: OsahformController::downloaddocAction()
 */
export const downloadForm1ZipHandler = (req, res) => {
  const { id } = req.params;

  if (!isValidTimestamp(id)) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: 'Invalid zip folder ID.',
      data: null,
    });
  }

  const zipFolder = path.join(getStorageRoot(), 'upload', 'zip_folder', id);

  if (!fsSync.existsSync(zipFolder)) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: 'ZIP folder not found or has expired.',
      data: null,
    });
  }

  const today = new Date()
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const zipFileName = `DDSFORM1_${today}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

  const archive = archiver('zip', { zlib: { level: 1 } });

  archive.on('error', (err) => {
    logger.error('Print Form1: ZIP streaming error', { error: err.message });
    if (!res.headersSent) {
      res.status(500).end();
    }
  });

  archive.pipe(res);
  archive.directory(zipFolder, false);
  archive.finalize();
};
