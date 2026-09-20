import { validateAddDocument } from '../../helpers/docketDetailPageValidators.js';
import { uploadDocketFileToClamav } from '../../services/clamav/docketClamavUploadService.js';
import DocumentTypes from '../../models/case/documentTypeModel.js';
import { createDocumentAddedNotification } from '../../helpers/notification/documentAddedNotificationHelper.js';
import { logger } from '../../../config/winstonLogger.js';

const getValidationMessage = (validationError) =>
  validationError.details.map((detail) => detail.message).join(', ');

/**
 * Add a new docket file: create documentstable/attachmentpaths and hand off to the
 * existing (unchanged) ClamAV S3/SQS/EC2-worker pipeline. Matches PHP: Osahform/addfile.
 * Kept in its own file (rather than docketDetailPageDocumentController.js) to stay
 * under the project's per-file line limit without touching the existing controller.
 */
export async function addDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(200).json({ success: false, message: 'Validation error', data: null, error: 'File is required' });
    }

    const { error, value } = validateAddDocument({ ...req.body, fileSize: req.file.size });
    if (error) {
      return res.status(200).json({ success: false, message: 'Validation error', data: null, error: getValidationMessage(error) });
    }

    const document = await uploadDocketFileToClamav({
      caseId: value.docketNumber,
      documentType: value.documentType,
      dateFiled: value.dateFiled,
      description: value.description,
      isSealed: value.isSealed,
      createdBy: req.userId,
      file: req.file,
    });

    // Bell notification for docket followers ("Notify Me") — Files trigger.
    // Fires on upload (not scan completion) to match the other two triggers
    // (Document Templates, eFiling), which also notify immediately on add.
    // Non-fatal: createDocumentAddedNotification swallows its own errors so a
    // notification failure never turns a successful upload into an error response.
    await createDocumentAddedNotification({
      caseId: value.docketNumber,
      docId: document.documentId,
      documentType: value.documentType,
      actorUserId: req.userId,
    });

    return res.status(200).json({
      success: true,
      message: 'File uploaded. Performing security scan',
      data: { documentId: String(document.documentId) },
      error: null,
    });
  } catch (error) {
    logger.error('Error in addDocument:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, error: error.message });
  }
}

// Document Type dropdown options for the "+ Files" modal.
// Reuses the existing documenttypes table/model (already in the upgraded backend);
// matches legacy PHP: Osahform/getdocumenttypes ("SELECT DISTINCT documenttype ... ORDER BY documenttype ASC").
export async function getDocumentTypes(_req, res) {
  try {
    const rows = await DocumentTypes.findAll({
      attributes: ['documenttype'],
      group: ['documenttype'],
      order: [['documenttype', 'ASC']],
    });

    return res.status(200).json({
      success: true,
      message: 'Document types fetched successfully',
      data: rows.map((row) => row.documenttype),
      error: null,
    });
  } catch (error) {
    logger.error('Error in getDocumentTypes:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', data: [], error: error.message });
  }
}
