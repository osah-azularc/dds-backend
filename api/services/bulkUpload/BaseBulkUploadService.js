import fs from 'fs';
import csv from 'csv-parser';
import { Docket } from '../../models/index.js';
import DocketOpenCloseDetails from '../../models/DocketOpenCloseDetails.js';
import { logger } from '../../../config/winstonLogger.js';
import { ERROR_MESSAGES } from './bulkUploadCommonHelpers.js';

/**
 * Base Bulk Upload Service
 * Created by: Rizwan Hiroli
 * 
 * Abstract base class providing common functionality for all bulk upload services.
 * Eliminates duplicate code across CSS, CSS PAT-E, OIG EBT, and DFCS services.
 */
class BaseBulkUploadService {
  /**
   * Initialize results object with default values
   * @param {Object} options - Optional overrides for default values
   * @returns {Object} Results object
   */
  initializeResults(options = {}) {
    return {
      result: 'true',
      errorReport: [],
      duplicateCheck: 'false',
      noDocFound: 'false',
      missingFieldCheck: 'false',
      automationFlag: options.automationFlag || 'false',
      fileData: [],
      noDocFoundData: [],
      nofDocketCreated: 0,
      nofDocketNotCreated: 0,
      header: null,
    };
  }

  /**
   * Read and parse CSV file, validate headers
   * @param {string} filePath - Path to CSV file
   * @param {number} requiredColumns - Expected number of columns
   * @returns {Promise<{headerRow: Array, rows: Array}>} Parsed CSV data
   */
  async readCSVFile(filePath, requiredColumns) {
    const rows = [];
    let headerRow = null;
    let isFirstLine = true;

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ headers: false }))
        .on('data', (row) => {
          if (isFirstLine) {
            headerRow = Object.values(row);
            const filteredHeader = headerRow.filter(h => h && h.trim());
            if (filteredHeader.length !== requiredColumns) {
              reject(new Error(ERROR_MESSAGES.INVALID_CSV));
              return;
            }
            isFirstLine = false;
          } else {
            rows.push(Object.values(row));
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    return { headerRow, rows };
  }

  /**
   * Create docket open/close details record
   * @param {number} caseId - Docket case ID
   * @param {Object} user - Logged in user
   * @param {Date} currentDatetime - Current timestamp
   * @param {Object} transaction - Sequelize transaction
   * @returns {Promise<Object>} Created record
   */
  async createOpenCloseDetails(caseId, user, currentDatetime, transaction) {
    return DocketOpenCloseDetails.create({
      caseId,
      docketStatus: 'sys_generated',
      userId: user?.user_id ?? user?.id ?? user?.userId ?? 0,
      createdDate: currentDatetime,
    }, { transaction });
  }

  /**
   * Update docket number after creation
   * @param {number} caseId - Docket case ID
   * @param {string} docketNumber - Generated docket number
   * @param {Object} transaction - Sequelize transaction
   */
  async updateDocketNumber(caseId, docketNumber, transaction) {
    await Docket.update({ docketNumber }, { where: { caseId }, transaction });
  }

  /**
   * Update docket case name after party creation
   * @param {number} caseId - Docket case ID
   * @param {string} caseName - Case name (typically "LastName, FirstName")
   * @param {Object} transaction - Sequelize transaction
   */
  async updateCaseName(caseId, caseName, transaction) {
    await Docket.update({ caseName }, { where: { caseId }, transaction });
  }

  /**
   * Build final results object from processing data
   * @param {Object} results - Base results object
   * @param {Object} data - Processing results
   * @returns {Object} Final results object
   */
  buildResults(results, { duplicateRecords, validationErrorRecords, missingFieldErrorRecords, docketCreatedCount, totalRowCount }) {
    results.nofDocketCreated = docketCreatedCount;
    results.nofDocketNotCreated = totalRowCount - docketCreatedCount;
    results.noDocFound = validationErrorRecords.length > 0 ? 'true' : 'false';
    results.missingFieldCheck = missingFieldErrorRecords.length > 0 ? 'true' : 'false';
    results.duplicateCheck = duplicateRecords.length > 0 ? 'true' : 'false';

    if (duplicateRecords.length > 0) {
      results.errorReport = duplicateRecords;
      results.fileData = duplicateRecords;
      results.noDocFoundData = validationErrorRecords;
      results.result = 'false';
    } else if (missingFieldErrorRecords.length > 0 || validationErrorRecords.length > 0) {
      results.errorReport = [...missingFieldErrorRecords, ...validationErrorRecords];
      results.result = 'false';
    }

    return results;
  }

  /**
   * Format user's full name for docket clerk field
   * @param {Object} user - User object
   * @returns {string|undefined} Formatted name or undefined
   */
  formatDocketClerk(user) {
    if (!user) return undefined;
    const fullName = `${user.FirstName || ''} ${user.LastName || ''}`.trim();
    return fullName || undefined;
  }

  /**
   * Log error with context
   * @param {string} context - Error context description
   * @param {Error} error - Error object
   */
  logError(context, error) {
    logger.error(`Error in ${context}:`, { error: error.message, stack: error.stack });
  }

  /**
   * Fire off NOH generation for already-created dockets without blocking the caller.
   * Intended to be called after the import response has already been built, so
   * nofDocketCreated/nofDocketNotCreated reflect docket creation only. Dockets are
   * processed sequentially (not in parallel) to avoid spiking DB-connection-pool /
   * PDF-render load, and per-docket failures are logged but never surfaced back to
   * the (already-responded) request.
   * @param {Array<number>} caseIds - Case IDs to generate NOH letters for
   * @param {Function} generateImportNOH - Bound instance method, e.g. this.generateImportNOH.bind(this)
   * @param {Object} user - Logged in user
   * @param {string|null} bulkMailBatchTimestamp - Shared batch folder timestamp
   * @param {string} label - Agency label used in log messages
   */
  runNOHGenerationInBackground(caseIds, generateImportNOH, user, bulkMailBatchTimestamp, label) {
    if (caseIds.length === 0) return;

    (async () => {
      logger.info(`Background NOH generation started for ${caseIds.length} ${label} docket(s).`);
      for (const caseId of caseIds) {
        try {
          await generateImportNOH(caseId, user, bulkMailBatchTimestamp);
        } catch (error) {
          logger.error(`Unhandled error during background NOH generation for docket ${caseId}:`, { error: error.message, stack: error.stack });
        }
      }
      logger.info(`Background NOH generation finished for ${label}.`);
    })();
  }
}

export default BaseBulkUploadService;

