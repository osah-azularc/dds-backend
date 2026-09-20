/**
 * @module reviewForm1PrintHelper
 * @description Auto-attaches a "Form 1 Print" PDF to a newly approved docket
 *              using the generic template pipeline. No-ops if no "form1" print
 *              template is mapped for the agency/casetype.
 */
import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { convertDocxToPdfWithoutS3, cleanupTempFiles } from '../../../helpers/s3.js';
import { buildTemplateEfsPath } from '../../services/documentTemplates/storage/efsTemplateStorageService.js';
import { getEfsBasePath } from '../../utilities/efsPath.js';
import { applyMergeFields } from '../../services/documentTemplates/mergeService.js';
import { getMappedTemplateDoc } from '../../services/documentTemplateMappingService.js';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import { logger } from '../../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Auto-attaches a "Form 1 Print" PDF to a newly approved docket
                using the generic admin-configured template pipeline.
*/

const FORM1_PRINT_AUTOMATION_TYPE = 'form1';

/**
 * @param {number} docketId - The newly created docket's caseId
 * @param {{refAgency: string, caseType: string}} docket
 * @returns {Promise<string|null>} the attached PDF's file name, or null if no
 *          template is mapped / generation failed (approval still succeeds either way)
 */
export async function attachForm1PrintPdf(docketId, { refAgency, caseType }) {
  try {
    const templateDoc = await getMappedTemplateDoc(
      FORM1_PRINT_AUTOMATION_TYPE,
      refAgency,
      caseType,
      null,
    );
    if (!templateDoc) return null;

    const efsTemplatePath = buildTemplateEfsPath(templateDoc.documentname);
    if (!fs.existsSync(efsTemplatePath)) return null;

    const basePath = getEfsBasePath();
    const timestamp = moment().format('MMDDYYYYHHmmss');
    const doctype = templateDoc.documenttype || 'Form1';
    const pdfFileName = `${docketId}_${templateDoc.documentname.replace(/\.docx$/i, '.pdf')}`;
    const uploadDir = path.join(basePath, 'upload', String(docketId), doctype, timestamp);
    fs.mkdirSync(uploadDir, { recursive: true });
    const attachmentPath = `/upload/${docketId}/${doctype}/${timestamp}//${pdfFileName}`;
    const pdfFilePath = path.join(uploadDir, pdfFileName);

    let fileStreamData;
    try {
      const templateBuffer = fs.readFileSync(efsTemplatePath);
      const docxBuffer = await applyMergeFields(templateBuffer, docketId);
      fileStreamData = await convertDocxToPdfWithoutS3({ buffer: docxBuffer });
      if (!fileStreamData?.streamPdf) return null;
      fs.writeFileSync(pdfFilePath, fileStreamData.streamPdf);
    } finally {
      cleanupTempFiles(fileStreamData?.tmpDocx || null, fileStreamData?.tmpPdf || null, null, null);
    }

    const docRecord = await DocumentsTable.create({
      caseId: docketId,
      docketCaseId: docketId,
      documentType: doctype,
      documentName: pdfFileName,
      dateRequested: new Date().toISOString().slice(0, 10),
      createdDate: new Date(),
      modifiedDate: new Date(),
    });

    await AttachmentPathsModel.create({ documentId: docRecord.documentId, attachmentPath });

    return pdfFileName;
  } catch (error) {
    logger.error('[ReviewForm1PrintHelper] Failed to generate/attach Form1 print PDF:', error);
    return null;
  }
}
