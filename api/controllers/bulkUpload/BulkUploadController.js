import path from 'node:path';
import { escapeCsvValue } from '../../utilities/csvEscape.js';
import cssBulkUploadService from '../../services/bulkUpload/cssBulkUploadService.js';
import cssPateBulkUploadService from '../../services/bulkUpload/cssPateBulkUploadService.js';
import oigEbtBulkUploadService from '../../services/bulkUpload/oigEbtBulkUploadService.js';
import dfcsBulkUploadService from '../../services/bulkUpload/dfcsBulkUploadService.js';
import dfcsMissingDocService from '../../services/bulkUpload/dfcsMissingDocService.js';
import dhsCsvListingService from '../../services/bulkUpload/dhsCsvListingService.js';
import { removeOldFiles } from '../../helpers/fileHelper.js';
import { logger } from '../../../config/winstonLogger.js';

/**
 * Generate CSV content from error records
 * Created by: Rizwan Hiroli
 * @param {Array} headers - CSV header array
 * @param {Array} errorReport - Array of error record objects
 * @returns {string} CSV content string
 */
const generateErrorReportCSV = (headers, errorReport) => {
  // Ensure error_msg column is included
  const csvHeaders = [...headers];
  if (!csvHeaders.includes('error_msg')) {
    csvHeaders.push('error_msg');
  }

  const csvRows = [];
  // Header row — header names come from the uploaded CSV's own header row, so they need the
  // same formula-injection guard as data cells (see escapeCsvValue).
  csvRows.push(csvHeaders.map(escapeCsvValue).join(','));

  // Data rows
  errorReport.forEach((row) => {
    const values = csvHeaders.map((h) => escapeCsvValue(row[h]));
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
};

/**
    Created by  : Rizwan Hiroli
    Date        : 22-04-2026
    Description : Factory that builds an Express handler for a bulk-import endpoint.
                  All four agency imports (CSS EST, CSS PAT-E, OIG EBT, DFCS) share the same
                  orchestration: validate file -> clean old uploads -> delegate to service -> shape response.
    Parameters  :
        - service (Object)            : Service instance exposing the import method
        - methodName (string)         : Name of the service method to invoke
        - defaultUploadPath (string)  : Fallback upload folder when UPLOAD_PATH env is unset
        - label (string)              : Human-readable label used in response messages

    Response    : Returns an async (req, res) handler. JSON shape matches the legacy per-agency handlers.
*/
const createImportHandler = ({ service, methodName, defaultUploadPath, label }) => async (req, res) => {
  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'No file uploaded. Please select a CSV file to upload.',
        data: null,
      });
    }

    // Clean up old upload folders (>3 days)
    const uploadBasePath = process.env.UPLOAD_PATH || defaultUploadPath;
    await removeOldFiles(uploadBasePath, 3);

    // Process the CSV file using the service class
    const result = await service[methodName](req.file.path, req.user);

    // Success response with data
    if (result.result === 'true') {
      return res.status(200).json({
        status: 200,
        success: true,
        message: `${label} import completed successfully. ${result.nofDocketCreated} docket(s) created.`,
        data: {
          nofDocketCreated: result.nofDocketCreated,
          nofDocketNotCreated: result.nofDocketNotCreated,
          automationFlag: result.automationFlag,
        },
      });
    }

    // Generate error report CSV on backend
    const errorReportCSV = generateErrorReportCSV(result.header, result.errorReport);

    // Partial success or validation errors - return with pre-generated CSV
    return res.status(200).json({
      status: 200,
      success: false,
      message: `${label} import completed with errors. ${result.nofDocketCreated} docket(s) created, ${result.nofDocketNotCreated} failed.`,
      data: {
        nofDocketCreated: result.nofDocketCreated,
        nofDocketNotCreated: result.nofDocketNotCreated,
        errorCount: result.errorReport.length,
        errorReportCSV, // Pre-generated CSV content for direct download
        automationFlag: result.automationFlag,
      },
    });
  } catch (error) {
    logger.error(`Error in ${methodName} controller:`, { error: error.message, stack: error.stack });

    // Check if it's a CSV format error
    if (error.message && error.message.includes('CSV')) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      success: false,
      message: `Failed to process ${label} import. Please try again.`,
      data: null,
    });
  }
};

/**
 * Bulk import handler for CSS EST (Child Support Services - Establishment).
 * CSV: 33 columns. Cleans ./uploads/css (or UPLOAD_PATH) before processing.
 * Created by: Rizwan Hiroli
 */
export const importCSSEST = createImportHandler({
  service: cssBulkUploadService,
  methodName: 'importCSSEST',
  defaultUploadPath: './uploads/css',
  label: 'CSS EST',
});

/**
 * Bulk import handler for CSS PAT-E (Child Support Services - Paternity Establishment).
 * CSV: 39 columns. Cleans ./uploads/css (or UPLOAD_PATH) before processing.
 * Created by: Rizwan Hiroli
 */
export const importCSSPATE = createImportHandler({
  service: cssPateBulkUploadService,
  methodName: 'importCSSPATE',
  defaultUploadPath: './uploads/css',
  label: 'CSS PAT-E',
});

/**
 * Bulk import handler for OIG EBT (Office of Inspector General - Electronic Benefit Transfer).
 * CSV: 27 columns. Cleans ./uploads/oig (or UPLOAD_PATH) before processing.
 * Created by: Rizwan Hiroli
 */
export const importOIGEBT = createImportHandler({
  service: oigEbtBulkUploadService,
  methodName: 'importOIGEBT',
  defaultUploadPath: './uploads/oig',
  label: 'OIG EBT',
});

/**
 * Bulk import handler for DFCS (Division of Family and Children Services).
 * Handles both DFCS and DFCS-M based on case type (FSP/TANF -> DFCS, others -> DFCS-M).
 * CSV: 45 columns. Cleans ./uploads/dfcs (or UPLOAD_PATH) before processing.
 * Created by: Rizwan Hiroli
 */
export const importDFCS = createImportHandler({
  service: dfcsBulkUploadService,
  methodName: 'importDFCS',
  defaultUploadPath: './uploads/dfcs',
  label: 'DFCS',
});

/**
 * DFCS Missing Documents check handler.
 * Legacy: OsahformController::uploadDfcsMissingDocAction
 *
 * Validates the CSV, confirms a matching open docket exists per row, then
 * reconciles that docket's required documents (Adverse Action Letter,
 * Hearing Request) against the DHS S3 forms bucket — attaching any
 * newly-found documents and reporting whichever required type is still
 * missing. See dfcsMissingDocService.js / dfcsMissingDocS3Helper.js /
 * dfcsDocumentAttachmentHelper.js for the implementation.
 */
export const importDFCSMissingDoc = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'No file uploaded. Please select a CSV file to upload.',
        data: null,
      });
    }

    const uploadBasePath = process.env.UPLOAD_PATH || './uploads/dfcs';
    await removeOldFiles(uploadBasePath, 3);

    const result = await dfcsMissingDocService.importDFCSMissingDoc(req.file.path, req.user);

    if (result.result === 'true') {
      return res.status(200).json({
        status: 200,
        success: true,
        message: `DFCS Missing Documents check completed successfully. ${result.nofDocketsFound} docket(s) found.`,
        data: {
          nofDocketsFound: result.nofDocketsFound,
          nofDocketsNotFound: result.nofDocketsNotFound,
        },
      });
    }

    const errorReportCSV = generateErrorReportCSV(result.header, result.errorReport);

    return res.status(200).json({
      status: 200,
      success: false,
      message: `DFCS Missing Documents check completed with errors. ${result.nofDocketsFound} docket(s) found, ${result.nofDocketsNotFound} not found.`,
      data: {
        nofDocketsFound: result.nofDocketsFound,
        nofDocketsNotFound: result.nofDocketsNotFound,
        errorCount: result.errorReport.length,
        errorReportCSV,
      },
    });
  } catch (error) {
    logger.error('Error in importDFCSMissingDoc controller:', { error: error.message, stack: error.stack });

    if (error.message && error.message.includes('CSV')) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to process DFCS Missing Documents check. Please try again.',
      data: null,
    });
  }
};

/*
  * "Will this import auto-generate an NOH" status for every agency that supports it, in one
 * response — so the frontend can fetch it once (e.g. on mount) instead of a route per agency
 * re-fetched on every dropdown change. Reuses each service's own checkAutomationFlag() — the
 * same check the import itself runs. Add a key here when a new agency gets NOH automation;
 * no new route needed. Agencies with automation permanently disabled (CSS PAT-E, DFCS) aren't
 * listed — the frontend treats those as "always show the disclaimer" statically.
 * Created by: Rizwan Hiroli
 */
const NOH_STATUS_SERVICES = {
  CSS_EST: cssBulkUploadService,
  OIG_EBT: oigEbtBulkUploadService,
};

export const getBulkUploadAutomationStatus = async (_req, res) => {
  const entries = await Promise.all(
    Object.entries(NOH_STATUS_SERVICES).map(async ([agencyKey, service]) => {
      try {
        return [agencyKey, await service.checkAutomationFlag()];
      } catch (error) {
        logger.error(`Error checking NOH automation status for ${agencyKey}:`, { error: error.message, stack: error.stack });
        // Fail safe: report automation as unavailable so the frontend shows the disclaimer
        // rather than silently hiding a real "no NOH will be generated" caveat.
        return [agencyKey, 'false'];
      }
    }),
  );

  return res.status(200).json({ status: 200, success: true, data: Object.fromEntries(entries) });
};

/**
 * List CSV files in the DHS S3 bucket, merged with clerk review status/notes.
 * Legacy: OsahformController::getAwsCsvObjectsListBucketAction
 * Created by: Rizwan Hiroli
 */
export const listDhsCsvObjects = async (_req, res) => {
  try {
    const csvFiles = await dhsCsvListingService.listCsvObjects();
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'DHS CSV file list retrieved successfully.',
      data: csvFiles,
    });
  } catch (error) {
    logger.error('Error in listDhsCsvObjects controller:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to retrieve DHS CSV file list. Please try again.',
      data: null,
    });
  }
};

// Mirrors the frontend's STATUS_OPTIONS (DHSFilesTab.jsx) and the DB enum
// on dhs_clerk_csv_listing_screen.status ('0' = Pending, '1' = Imported).
const DHS_STATUS_TO_DB = { Pending: '0', Imported: '1' };

/**
 * Save (upsert) notes and status for a DHS CSV file.
 * Legacy: OsahformController::saveDhsNotesAction
 * Created by: Rizwan Hiroli
 */
export const saveDhsCsvListing = async (req, res) => {
  try {
    const { fileName, status, notes } = req.body;
    if (!fileName) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'fileName is required.',
        data: null,
      });
    }
    if (!Object.prototype.hasOwnProperty.call(DHS_STATUS_TO_DB, status)) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `status must be one of: ${Object.keys(DHS_STATUS_TO_DB).join(', ')}.`,
        data: null,
      });
    }
    const dbStatus = DHS_STATUS_TO_DB[status];
    const record = await dhsCsvListingService.upsertCsvListing(fileName, dbStatus, notes ?? '');
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'DHS CSV listing saved successfully.',
      data: record,
    });
  } catch (error) {
    logger.error('Error in saveDhsCsvListing controller:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to save DHS CSV listing. Please try again.',
      data: null,
    });
  }
};

/**
 * Download a CSV file from the DHS S3 bucket by key.
 * Legacy: OsahformController::dwnldAwsCsvObjctsFrmBcktAction
 * Created by: Rizwan Hiroli
 */
export const downloadDhsCsvObject = async (req, res) => {
  try {
    const { fileName } = req.query;
    if (!fileName) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'fileName query parameter is required.',
        data: null,
      });
    }

    const fileStream = await dhsCsvListingService.getCsvObjectStream(fileName);

    // Strip control characters to prevent header injection from the filename
    const safeFileName = path.basename(fileName).replace(/[\r\n]/g, '');

    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.setHeader('Cache-Control', 'must-revalidate, post-check=0, pre-check=0, public');
    res.setHeader('Pragma', 'public');
    res.setHeader('Expires', '0');

    fileStream.pipe(res);
  } catch (error) {
    if (error.code === 'INVALID_FILE_NAME') {
      logger.warn('Rejected DHS CSV download with invalid file name.', { fileName: req.query.fileName });
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Invalid file name.',
        data: null,
      });
    }

    logger.error('Error in downloadDhsCsvObject controller:', { error: error.message, stack: error.stack });
    return res.status(404).json({
      status: 404,
      success: false,
      message: 'Failed to download the requested file.',
      data: null,
    });
  }
};
