// Temp template upload and preview controllers: upload, temp preview, EFS preview, delete.

import fs from 'fs';
import path from 'path';
import { generatePreviewWithSampleValues, cleanupPreviewFile } from '../../services/templatePreviewService.js';
import { convertDocxToPdfWithoutS3 } from '../../../helpers/s3.js';
import { saveTempFile, getTempFilePath, deleteTempFile, TEMP_DIR } from '../../../helpers/templateTempStorage.js';
import { logger } from '../../../config/winstonLogger.js';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { buildTemplateEfsPath } from '../../services/documentTemplates/storage/efsTemplateStorageService.js';
import DocumentTemplates from '../../models/admin/documentTemplatesModel.js';

// POST /admin/uploadTemplateTemp — save uploaded DOCX to tmp dir, return tempId.
export const uploadTemplateTempV2 = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded.',
      });
    }

    // Validate file type
    if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({
        success: false,
        message: 'Only .docx files are allowed.',
      });
    }

    // Save file to temp directory using helper (ensures consistent path with getTempFilePath)
    const { tempId, originalFileName } = await saveTempFile(req.file.buffer, req.file.originalname);

    return res.status(200).json({
      success: true,
      data: {
        tempId,
        tempFileName: originalFileName,
      },
      message: 'File uploaded successfully.',
    });
  } catch (error) {
    logger.error('Error uploading temp template:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload template.',
      error: error.message,
    });
  }
};

// GET /admin/previewTemplateTemp/:tempId — inject sample values into temp DOCX and stream PDF preview.
export const previewTemplateTempV2 = async (req, res) => {
  let previewDocxPath = null;

  try {
    const { tempId } = req.params;

    if (!tempId) {
      return res.status(400).json({
        success: false,
        message: 'tempId is required.',
      });
    }

    // Get temp file path using helper (ensures consistent path with saveTempFile)
    const tempFilePath = getTempFilePath(tempId);

    // Verify temp file exists
    if (!fs.existsSync(tempFilePath)) {
      return res.status(404).json({
        success: false,
        message: 'Temp file not found. Please upload the document again.',
        debug: { tempFilePath },
      });
    }

    // Generate preview DOCX with sample values (preview goes to same directory)
    const tempDir = path.dirname(tempFilePath);
    previewDocxPath = path.join(tempDir, `${tempId}-preview.docx`);
    
    const previewResult = await generatePreviewWithSampleValues(
      tempFilePath,
      previewDocxPath,
      'legacy_core'
    );

    // Verify preview DOCX was created
    if (!fs.existsSync(previewDocxPath)) {
      throw new Error('Preview DOCX was not created');
    }

    // Convert preview DOCX to PDF
    // Note: convertDocxToPdfWithoutS3 expects templateData object with buffer property
    // It creates its own temp files and returns { tmpDocx, tmpPdf, streamPdf }
    const docxBuffer = fs.readFileSync(previewDocxPath);
    const conversionResult = await convertDocxToPdfWithoutS3({ buffer: docxBuffer });
    
    // Use the PDF buffer from the conversion result
    const pdfBuffer = conversionResult.streamPdf;
    
    // Clean up temp files created by conversion function
    if (conversionResult.tmpDocx) {
      setTimeout(() => cleanupPreviewFile(conversionResult.tmpDocx), 1000);
    }
    if (conversionResult.tmpPdf) {
      setTimeout(() => cleanupPreviewFile(conversionResult.tmpPdf), 1000);
    }
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF file is empty or could not be read');
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);

    // Clean up preview DOCX file after sending response
    setTimeout(() => {
      if (previewDocxPath) cleanupPreviewFile(previewDocxPath);
    }, 1000);

  } catch (error) {
    logger.error('Error previewing temp template:', error);
    
    // Clean up on error
    if (previewDocxPath) cleanupPreviewFile(previewDocxPath);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate preview.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// GET /admin/previewEfsTemplate/:templateId — inject sample values into saved EFS DOCX and stream PDF preview.
export const previewEfsTemplateV2 = async (req, res) => {
  let previewDocxPath = null;

  try {
    const { templateId } = req.params;
    const templateIdNum = Number(templateId);

    if (!templateIdNum || templateIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid templateId is required.',
      });
    }

    // Look up the saved documentname from DB
    const templateRow = await DocumentTemplates.findByPk(templateIdNum, {
      attributes: ['documentname'],
    });

    if (!templateRow) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.',
      });
    }

    const { documentname } = templateRow;

    // Resolve the active EFS path for this template's DOCX
    const efsDocxPath = buildTemplateEfsPath(documentname);

    if (!fs.existsSync(efsDocxPath)) {
      return res.status(404).json({
        success: false,
        message: 'Template file not found on EFS. The template file may not have been persisted yet.',
      });
    }

    // Write preview DOCX to the same temp dir used by Add preview
    previewDocxPath = path.join(TEMP_DIR, `efs-preview-${templateIdNum}.docx`);

    // Inject catalog sample values and produce preview DOCX (identical pipeline to Add preview)
    await generatePreviewWithSampleValues(efsDocxPath, previewDocxPath, 'legacy_core');

    if (!fs.existsSync(previewDocxPath)) {
      throw new Error('Preview DOCX was not created');
    }

    // Convert preview DOCX → PDF
    const docxBuffer = fs.readFileSync(previewDocxPath);
    const conversionResult = await convertDocxToPdfWithoutS3({ buffer: docxBuffer });

    if (conversionResult.tmpDocx) setTimeout(() => cleanupPreviewFile(conversionResult.tmpDocx), 1000);
    if (conversionResult.tmpPdf) setTimeout(() => cleanupPreviewFile(conversionResult.tmpPdf), 1000);

    const pdfBuffer = conversionResult.streamPdf;

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF conversion produced empty output');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    setTimeout(() => {
      if (previewDocxPath) cleanupPreviewFile(previewDocxPath);
    }, 1000);

  } catch (error) {
    logger.error('[previewEfsTemplateV2] Error:', error);

    if (previewDocxPath) cleanupPreviewFile(previewDocxPath);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate preview.',
        error: error.message,
      });
    }
  }
};

export const deleteTempFileV2 = async (req, res) => {
  try {
    const { tempId } = req.params;

    if (!tempId || typeof tempId !== 'string' || tempId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'tempId is required.',
      });
    }

    await deleteTempFile(tempId);

    return res.status(200).json({
      success: true,
      message: 'Temp file deleted.',
    });
  } catch (error) {
    logger.error('[deleteTempFileV2] Failed to delete temp file', {
      tempId: req.params.tempId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to delete temp file.',
    });
  }
};

export default {
  uploadTemplateTempV2,
  previewTemplateTempV2,
  previewEfsTemplateV2,
  deleteTempFileV2,
};
