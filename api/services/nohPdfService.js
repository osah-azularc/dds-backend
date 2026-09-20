/**
 * NOH PDF Service
 * Handles EFS path resolution and PDF generation for NOH documents.
 * Mirrors PHP generateDocumentTemplate file-storage logic.
 */
import path from 'node:path';
import moment from 'moment';
import fs from 'node:fs';
import { convertDocxToPdfWithoutS3, cleanupTempFiles } from '../../helpers/s3.js';
import { buildTemplateEfsPath } from './documentTemplates/storage/efsTemplateStorageService.js';
import { getEfsBasePath } from '../utilities/efsPath.js';
import { applyMergeFields } from './documentTemplates/mergeService.js';

export const getEfsTemplatePath = (documentName) => buildTemplateEfsPath(documentName);

/**
 * Generate the NOH PDF from the DOCX template and save to EFS.
 * Mirrors PHP generateDocumentTemplate — no S3, files live on the shared filesystem.
 * Returns { attachmentPath, pdfFileName } where attachmentPath is the URL-relative path
 * stored in attachmentpaths (e.g. /upload/2500003/NOH/06042026053349//file.pdf).
 */
export const generateAndSaveNOHPdf = async (caseid, templateDoc, mergeData) => {
  const basePath = getEfsBasePath();

  // PHP: $folderdatename = date('mdYHis') → MMDDYYYYHHmmss
  const timestamp = moment().format('MMDDYYYYHHmmss');
  const doctype = templateDoc.documenttype || 'NOH';
  const pdfFileName = `${caseid}_${templateDoc.documentname.replace(/\.docx$/i, '.pdf')}`;

  // Upload dir mirrors PHP: file-storage/upload/{caseid}/{doctype}/{timestamp}/
  const uploadDir = path.join(basePath, 'upload', String(caseid), doctype, timestamp);
  fs.mkdirSync(uploadDir, { recursive: true });

  // PHP attachmentpath: "/upload/{caseid}/{doctype}/{timestamp}//" + filename (double slash is PHP's pattern)
  const attachmentPath = `/upload/${caseid}/${doctype}/${timestamp}//${pdfFileName}`;
  const pdfFilePath = path.join(uploadDir, pdfFileName);

  const efsTemplatePath = getEfsTemplatePath(templateDoc.documentname);
  if (!fs.existsSync(efsTemplatePath)) {
    throw new Error(`NOH template not found on EFS: ${templateDoc.documentname} (path: ${efsTemplatePath})`);
  }

  let fileStreamData;
  try {
    const templateBuffer = fs.readFileSync(efsTemplatePath);
    const docxBuffer = await applyMergeFields(templateBuffer, caseid, mergeData, { throwOnError: true });

    fileStreamData = await convertDocxToPdfWithoutS3({ buffer: docxBuffer });
    if (!fileStreamData?.streamPdf) throw new Error('PDF conversion failed for NOH document');

    fs.writeFileSync(pdfFilePath, fileStreamData.streamPdf);
    return { attachmentPath, pdfFileName, pdfBuffer: fileStreamData.streamPdf };
  } finally {
    cleanupTempFiles(
      fileStreamData?.tmpDocx || null,
      fileStreamData?.tmpPdf || null,
      null,
      null
    );
  }
};
