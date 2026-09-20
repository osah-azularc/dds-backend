import { exportSearchResults } from '../helpers/searchResultsExportHelper.js';
import { downloadCaseFilesInZip } from '../helpers/searchResultsDownloadHelper.js';
import fs from 'fs';

/**
 * Export search results as CSV
 * @route POST /search-results/export
 * @param {Object} req.body.condition - Search condition object
 * @param {Object} req.body.additionalCondition - Additional condition (sorting)
 * @param {String} req.body.searchType - Search type ('general' or 'closedCases')
 * @param {Boolean} [req.body.fromUpcomingCalendar] - When true, export the reduced Calendar-print
 *   column set (S.No, Docket Number, Petitioner / Respondent, ...) instead of the full column set.
 * @returns {File} - CSV file download
 */
export const exportSearchResultsAction = async (req, res) => {
  try {
    const { condition, additionalCondition, searchType, fromUpcomingCalendar } = req.body;

    if (!condition) {
      return res.status(400).json({ error: 'Missing search condition' });
    }

    const csvData = await exportSearchResults(
      condition,
      additionalCondition,
      searchType,
      fromUpcomingCalendar === true,
    );

    if (!csvData) {
      return res.status(404).json({ error: 'No records found' });
    }

    // Set headers for CSV download (matching osah-repos format)
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const filename = `excelsheets${year}-${month}-${day}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(csvData);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

/**
 * Download case files as ZIP
 * @route POST /search-results/download
 * @param {Array} req.body.caseIds - Array of case IDs to download
 * @param {String} req.body.downloadType - Download type ('case-files' or 'decisions')
 * @param {Object} req.body.userSessionData - User session data
 * @returns {File} - ZIP file download
 */
export const downloadCaseFilesAction = async (req, res) => {
  try {
    // Support both legacy PHP payload (createzipAction) and new search-results payload
    let {
      caseIds,
      downloadType,
      userSessionData,
      judgename,
      docType,
    } = req.body || {};


    // Map numeric docType to downloadType if not explicitly provided
    // PHP: docType == 2 => only Decision documents, else => all case files
    if (!downloadType && typeof docType !== 'undefined') {
      downloadType = String(docType) === '2' ? 'decisions' : 'case-files';
    }

    // Validate caseIds is an array
    if (!Array.isArray(caseIds)) {
      return res.status(400).json({ error: 'caseIds must be an array' });
    }

    // Validate caseIds is not empty
    if (caseIds.length === 0) {
      return res.status(400).json({ error: 'caseIds cannot be empty' });
    }

    // Validate each case ID is a valid string or number
    const invalidIds = caseIds.filter(id => !id || (typeof id !== 'string' && typeof id !== 'number'));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: 'All case IDs must be valid strings or numbers' });
    }

    // Validate downloadType
    const validDownloadTypes = ['case-files', 'decisions'];
    if (!downloadType || !validDownloadTypes.includes(downloadType)) {
      return res.status(400).json({
        error: `downloadType must be one of: ${validDownloadTypes.join(', ')}`,
      });
    }

    // Get user ID from session data or JWT
    const userId = userSessionData?.user_id || req.user?.userId || 'temp';
    const firstName = userSessionData?.firstname || req.user?.firstName || '';
    const lastName = userSessionData?.lastname || req.user?.lastName || '';

    const result = await downloadCaseFilesInZip(
      caseIds,
      downloadType,
      {
        user_id: userId,
        firstname: firstName,
        lastname: lastName,
      },
      {
        judgeName: judgename,
        docType,
      },
    );

    if (!result.success) {
      // Mirrors PHP createzipAction: when docType==2 and no decisions exist, echo 2
      // → AngularJS shows "Respective documents do not exist"
      if (result.noDocumentsFound) {
        return res.status(200).json({ result: false, message: 'Respective documents do not exist' });
      }
      const status = result.isValidationError ? 400 : 500;
      return res.status(status).json({ result: false, error: result.error });
    }

    // Send the ZIP file as a download
    const zipFilePath = result.zipFilePath;
    const zipFileName = result.zipFileName;

    if (!fs.existsSync(zipFilePath)) {
      return res.status(404).json({ error: 'ZIP file not found' });
    }

    // Set headers for file download (matching Agency project)
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Stream the file to the response (matching Agency project)
    const fileStream = fs.createReadStream(zipFilePath);

    fileStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });

    // Pipe and wait for response to finish before cleanup
    fileStream.pipe(res);

    res.on('finish', () => {
      // Response has been fully sent to client
      // Optionally delete the file after download
      // fs.unlinkSync(zipFilePath);
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }
};

