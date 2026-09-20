import fs from 'node:fs';
import path from 'node:path';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import DeletedAttachmentPathsModel from '../../models/DeletedAttachmentPathsModel.js';
import {
	  getDocumentById,
	  updateDocumentById,
	  addDocumentHistory,
	  getDocumentAttachmentPath,
	} from '../../helpers/docketDetail/documentDataHelper.js';
import { checkAwsArchivedDocuments, getAlternativeStorageSignedDownloadUrl} from '../../../helpers/s3.js';
import { handleDocumentDownload } from '../../helpers/docketDetail/documentStorageHelper.js';
import { resolveStorageAbsolutePath, getStorageBaseRoot } from '../../helpers/docketDetail/storagePathUtils.js';
import {
  validateGetDocument,
  validateUpdateDocument,
} from '../../helpers/docketDetailPageValidators.js';
import { logger } from "../../../config/winstonLogger.js";

const normalizeAttachmentResponsePath = (attachmentPath) => (`/${String(attachmentPath || '')}`)
  .replaceAll(/\\+/g, '/')
  .replace(/^\/+/, '/');
const isAlternativeStoragePath = (filePath) => /^\/?eCourt-(Dev|Stg|Uat|Prod)\//i.test(String(filePath || '').trim());

const getValidationMessage = (validationError) => validationError.details.map((detail) => detail.message).join(', ');
const normalizeId = (value) => (value === undefined || value === null || value === '' ? null : String(value));
const extractCaseIdFromCondition = (condition) => {
  const matched = /caseId\s*=\s*'?(\d+)'?/i.exec(String(condition || ''));
  return matched?.[1] || '';
};

const mapDocumentRowToResponse = (row) => {
  const isAltStorage = String(row?.isAltStorage ?? '0');

  return {
    documentId: normalizeId(row?.documentId),
    caseId: normalizeId(row?.caseId),
    documentType: row?.documentType ?? null,
    granted: row?.granted ?? null,
    dateRequested: row?.dateRequested ?? null,
    description: row?.description ?? null,
    attachmentFilePaths: row?.attachmentFilePaths ?? null,
    documentName: row?.documentName ?? null,
    noOfAttachments: row?.noOfAttachments ?? null,
    docketCaseId: normalizeId(row?.docketCaseId),
    docFileFlage: row?.docFileFlage ?? 0,
    rocFlag: row?.rocFlag ?? 0,
    casetypeDocId: normalizeId(row?.casetypeDocId),
    isScanned: String(row?.isScanned ?? '0'),
    createdBy: normalizeId(row?.createdBy),
    modifiedBy: normalizeId(row?.modifiedBy),
    createdDate: row?.createdDate ?? null,
    modifiedDate: row?.modifiedDate ?? null,
    isSealed: String(row?.isSealed ?? '0'),
    documentNameInAwsBucket: row?.documentNameInAwsBucket ?? '',
    isAltStorage,
    docArchived: String(row?.docArchived ?? '0'),
  };
};

export async function getDocketDocuments(req, res) {
  try {
    const { condition } = req.body;
    const caseId = String(extractCaseIdFromCondition(condition) || '').trim();

    if (!caseId) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: 'caseId is required in condition' });
    }

    const documentRows = await DocumentsTable.findAll({
      where: { caseId },
      order: [['documentId', 'ASC']],
    });

    const documents = documentRows.map((document) => {
      const row = document?.toJSON ? document.toJSON() : document;
      return mapDocumentRowToResponse(row);
    });

	    const documentsWithArchivedStatus = await checkAwsArchivedDocuments(documents);

    return res.status(200).json({
      success: true,
      message: documentsWithArchivedStatus.length > 0 ? 'Documents fetched successfully' : 'No documents found',
      data: documentsWithArchivedStatus,
      error: null,
    });
  } catch (error) {
    logger.error('Error fetching docket documents:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: error.message });
  }
}

export async function getDocument(req, res) {
  try {
    const { error, value } = validateGetDocument(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: getValidationMessage(error) });
    }

    const { docketNumber, docId } = value;
    const document = await getDocumentById(docId, docketNumber);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found', data: null, error: 'Document not found' });
    }

    return res.status(200).json({ success: true, message: 'Document fetched successfully', data: [document], error: null });
  } catch (error) {
    logger.error('Error in getDocument:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: error.message });
  }
}

export async function updateDocument(req, res) {
  try {
    const { error, value } = validateUpdateDocument(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: getValidationMessage(error) });
    }

    const { data, fileInfo } = value;
    const username = req.user?.email?.split('@')[0] || 'system';
    await updateDocumentById(data.updateDocId, fileInfo);

    const fileType = data.docFlag === '1' ? 'file' : 'Document template';
    const fileHeading = data.docFlag === '1' ? 'File Attachment Name' : 'Document Name';
    const sealedNew = fileInfo.isSealed === '1' ? 'Yes' : 'No';
    const sealedOld = data.isSealedHistory === '1' ? 'Yes' : 'No';

    const historyMessage = `<p class="history-title">The ${fileType} description has been updated:</p>`
      + `<p><span class="history-label">${fileHeading}:</span><span class="history-data">${data.fileName || ''}</span></p>`
      + `<p><span class="history-label">Description:</span><span class="history-data">${fileInfo.description || ''}</span></p>`
      + `<p><span class="history-label">Sealed:</span><span class="history-data">${sealedNew}</span></p>`
      + `<br><p class="history-title"><strong>Previous Entry: </strong></p>`
      + `<p class="history-title">The ${fileType} description was previously:</p>`
      + `<p><span class="history-label">${fileHeading}:</span><span class="history-data">${data.fileName || ''}</span></p>`
      + `<p><span class="history-label">Description:</span><span class="history-data">${data.descriptionHistory || ''}</span></p>`
      + `<p><span class="history-label">Sealed:</span><span class="history-data">${sealedOld}</span></p>`;

    await addDocumentHistory(data.docketNumber, historyMessage, username);
    return res.status(200).json({ success: true, message: 'Document updated successfully', data: { result: 'true' }, error: null });
  } catch (error) {
    logger.error('Error in updateDocument:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: error.message });
  }
}

export async function downloadDocument(req, res) {
  try {
    const { docId } = req.body;
    const { flag } = req.params;
    const forceDownloadParam = flag ?? req.body?.forceDownload ?? req.query?.forceDownload;
    const forceDownloadFlag = forceDownloadParam === '1'
      || forceDownloadParam === 1
      || forceDownloadParam === true
      || String(forceDownloadParam).toLowerCase() === 'true';

    if (!docId) {
      return res.status(400).json({ success: false, message: 'Validation error', data: '0', error: 'docId is required' });
    }

    const attachmentPath = await getDocumentAttachmentPath(docId);
    if (!attachmentPath) {
      return res.status(200).json({ success: true, message: 'File not found', data: '0', error: 'File Does Not Exist!' });
    }

    if (isAlternativeStoragePath(attachmentPath)) {
      const signedUrl = await getAlternativeStorageSignedDownloadUrl(attachmentPath);
      return res.status(200).json({
        success: true,
        message: 'File path retrieved successfully',
        data: signedUrl,
        error: null,
      });
    }

    if (!forceDownloadFlag) {
      const normalizedPath = `/file-storage${normalizeAttachmentResponsePath(attachmentPath)}`;
      return res.status(200).json({ 
        success: true, 
        message: 'File path retrieved successfully', 
        attachmentPath: normalizedPath, 
        data: normalizedPath, 
        error: null 
      });
    }

    const result = await handleDocumentDownload(attachmentPath, true);
    if (result.error) {
      const normalizedPath = normalizeAttachmentResponsePath(attachmentPath);
      return res.status(200).json({ success: true, message: 'File path retrieved successfully', data: normalizedPath, error: null });
    }

    return res.download(result.absolutePath, result.filename, (downloadError) => {
      if (downloadError && !res.headersSent) {
        logger.error('Error serving file:', downloadError);
        res.status(500).json({ success: false, message: 'Download failed', data: '404', error: 'Error serving file' });
      }
    });
  } catch (error) {
    logger.error('Error in downloadDocument:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: '404', error: error.message });
  }
}

function moveDocumentFileToTemp(absolutePath, imagename, resolvedDocumentId) {
  const storageBase = getStorageBaseRoot();
  const tempDir = path.join(storageBase, '..', 'temp', String(resolvedDocumentId));
  fs.mkdirSync(tempDir, { recursive: true });
  fs.copyFileSync(absolutePath, path.join(tempDir, imagename));
  fs.unlinkSync(absolutePath);
  try {
    fs.rmdirSync(path.dirname(absolutePath));
  } catch (e) {
    logger.warn('Could not remove empty directory after document move:', e.message);
  }
  return `/temp/${resolvedDocumentId}/${imagename}`;
}

export async function deleteDocument(req, res) {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: 'documentId is required' });
    }

    const resolvedDocumentId = Number.parseInt(String(documentId), 10);
    if (Number.isNaN(resolvedDocumentId)) {
      return res.status(400).json({ success: false, message: 'Validation error', data: null, error: 'Invalid document ID' });
    }

    // Fetch document details before deleting
    const docRow = await DocumentsTable.findOne({
      where: { documentid: resolvedDocumentId },
      attributes: ['caseId', 'documentName', 'documentType'],
      raw: true,
    });

    // Fetch attachment path before deleting
    const attachmentRow = await AttachmentPathsModel.findOne({
      where: { documentId: resolvedDocumentId },
      raw: true,
    });

    // Delete from documentstable
    const deleteResult = await DocumentsTable.destroy({ where: { documentid: resolvedDocumentId } });
    if (!deleteResult) {
      return res.status(200).json({ success: false, message: 'Error deleting document', data: '404', error: 'Document not found or could not be deleted' });
    }

    let tempPath = null;

    if (attachmentRow?.attachmentPath) {
      const imagename = docRow?.documentName || path.basename(attachmentRow.attachmentPath);

      // Mirrors PHP: copy to /temp/{docId}/, delete original, rmdir timestamp folder
      try {
        const { absolutePath } = resolveStorageAbsolutePath(attachmentRow.attachmentPath);
        if (absolutePath && fs.existsSync(absolutePath)) {
          tempPath = moveDocumentFileToTemp(absolutePath, imagename, resolvedDocumentId);
        }
      } catch (e) {
        logger.warn('File operation failed during document delete, file may already be missing:', e.message);
      }

      // Insert into deletedattachmentpaths (mirrors PHP insertData)
      if (tempPath) {
        await DeletedAttachmentPathsModel.create({
          documentId: resolvedDocumentId,
          deletedAttachmentPathsCol: tempPath,
        });
      }

      // Delete from attachmentpaths
      await AttachmentPathsModel.destroy({ where: { documentId: resolvedDocumentId } });
    }

    // Add history entry
    if (docRow) {
      const username = req.user?.email?.split('@')[0] || 'system';
      const historyMessage = `<p class="history-title">A document has been deleted.</p>`
        + `<p><span class="history-label">Document Name:</span><span class="history-data">${docRow.documentName || 'N/A'}</span></p>`
        + `<p><span class="history-label">Document Type:</span><span class="history-data">${docRow.documentType || 'N/A'}</span></p>`
        + `<p><span class="history-label">Deleted By:</span><span class="history-data">${username}</span></p>`;
      await addDocumentHistory(String(docRow.caseId), historyMessage, username);
    }

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
      data: { result: deleteResult, tempPath },
      error: null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error', data: '404', error: error.message });
  }
}