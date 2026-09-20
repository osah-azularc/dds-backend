import fs from 'fs';
import csv from 'csv-parser';
import { Op } from 'sequelize';
import { Docket } from '../../models/index.js';
import County from '../../models/County.js';
import Casetypes from '../../models/Casetypes.js';
import BaseBulkUploadService from './BaseBulkUploadService.js';
import {
  createErrorRecord,
  validateHearingDateFormat,
  isValidEmail,
  ERROR_MESSAGES,
} from './bulkUploadCommonHelpers.js';
import { DFCS_CONSTANTS, mapDfcsCsvRowToData } from './dfcsHelpers.js';
import {
  findMatchingDocuments,
  getMissingRequiredDocumentTypes,
  buildMissingDocumentMessage,
  NO_DOCUMENTS_FOUND_MESSAGE,
} from './dfcsMissingDocS3Helper.js';
import { attachDocumentIfNew } from './dfcsDocumentAttachmentHelper.js';

/**
 * DFCS Missing Documents Service
 * Created by: Rizwan Hiroli
 *
 * Checks whether an already-docketed DFCS / DFCS-M case (identified by
 * agency ref number + case type) exists, reusing the same 45-column CSV
 * layout as the DFCS import, then reconciles required documents against
 * the DHS S3 forms bucket (dfcsMissingDocS3Helper.js) and attaches any
 * newly-matched documents to the docket (dfcsDocumentAttachmentHelper.js).
 * Legacy: OsahformController::uploadDfcsMissingDocAction.
 */
class DfcsMissingDocService extends BaseBulkUploadService {
  /**
   * Initialize results object (mirrors DfcsBulkUploadService's simpler shape,
   * with counters renamed since this flow doesn't create dockets)
   */
  initializeMissingDocResults() {
    return {
      result: 'false',
      nofDocketsFound: 0,
      nofDocketsNotFound: 0,
      errorReport: [],
      header: [],
    };
  }

  /**
   * Main entry point for the DFCS Missing Documents check
   */
  async importDFCSMissingDoc(filePath, user = null) {
    const results = this.initializeMissingDocResults();
    const { headerRow, rows } = await this.readDfcsCSVFile(filePath);
    results.header = headerRow;

    if (headerRow.length !== DFCS_CONSTANTS.REQUIRED_COLUMNS) {
      results.errorReport.push({ error_msg: ERROR_MESSAGES.INVALID_CSV });
      return results;
    }

    // Legacy: a CSV with only a header row (no data rows) gets a distinct "empty file"
    // response (OsahformController.php:11058-11072) instead of silently reporting a
    // successful check with 0 dockets found.
    if (rows.length === 0) {
      results.errorReport.push({ error_msg: ERROR_MESSAGES.EMPTY_CSV });
      return results;
    }

    const lookupCache = await this.buildLookupCache();
    const userId = user?.user_id ?? user?.id ?? user?.userId ?? null;

    for (const csvRow of rows) {
      const rowResult = await this.processRow(csvRow, headerRow, lookupCache, userId);
      if (rowResult.skipped) continue;

      if (rowResult.found) {
        // Docket exists — count it as found even if it also has a document
        // issue (missing required type, S3 lookup failure); that issue
        // still needs to surface in the error report, but it's not a
        // "docket not found" outcome.
        results.nofDocketsFound++;
        if (rowResult.error) results.errorReport.push(rowResult.error);
      } else if (rowResult.error) {
        results.nofDocketsNotFound++;
        results.errorReport.push(rowResult.error);
      }
    }

    results.result = results.errorReport.length === 0 ? 'true' : 'false';
    return results;
  }

  /**
   * Read CSV file and return header and data rows.
   * Same simple parsing as DfcsBulkUploadService.readDfcsCSVFile — column
   * count is validated by the caller after parsing, not by the parser.
   */
  async readDfcsCSVFile(filePath) {
    const csvRows = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ headers: false }))
        .on('data', (row) => csvRows.push(Object.values(row)))
        .on('end', () => {
          if (csvRows.length === 0) {
            return resolve({ headerRow: [], rows: [] });
          }
          const headerRow = csvRows[0];
          const rows = csvRows.slice(1);
          resolve({ headerRow, rows });
        })
        .on('error', reject);
    });
  }

  /**
   * Build lookup cache for validation (county + casetype only — this flow
   * doesn't create parties/masters, so no caseworker/attorney lookups needed).
   * Casetypes query mirrors DfcsBulkUploadService.buildLookupCache() exactly —
   * scoped to DFCS/DFCS-M's own active case types, same as the import flow —
   * so dfcsCaseTypeSet can drive the same DFCS-vs-DFCS-M routing in
   * mapDfcsCsvRowToData() below (a row's agency must match how its docket was
   * actually created, or the docket lookup in processRow() never matches).
   */
  async buildLookupCache() {
    const [counties, casetypes] = await Promise.all([
      County.findAll({ attributes: ['countyId', 'countyDescription'] }),
      Casetypes.findAll({
        attributes: ['caseTypeId', 'caseCode', 'agencyId'],
        where: {
          agencyId: { [Op.in]: [DFCS_CONSTANTS.AGENCY_ID_DFCS, DFCS_CONSTANTS.AGENCY_ID_DFCS_M] },
          isActive: '1',
        },
      }),
    ]);

    return {
      countyMap: new Map(counties.map((c) => [c.countyDescription?.toUpperCase(), c.countyId])),
      casetypeSet: new Set(casetypes.map((c) => c.caseCode?.toUpperCase())),
      // Routing: active casetypes on Agency 32 (DFCS) specifically (OsahformController.php:9007-9010) —
      // a row's casecode being in this set is what decides DFCS vs DFCS-M. String()-coerced:
      // despite the Casetypes model declaring agencyId as STRING(100), mysql2 returns it as a
      // JS number — a bare `===` here silently matched nothing and defaulted every row to DFCS-M.
      dfcsCaseTypeSet: new Set(
        casetypes.filter((c) => String(c.agencyId) === DFCS_CONSTANTS.AGENCY_ID_DFCS).map((c) => c.caseCode?.toUpperCase()),
      ),
    };
  }

  /**
   * Process a single CSV row: validate, confirm a matching docket exists,
   * then reconcile that docket's documents against the DHS S3 forms
   * bucket. Matches legacy: the docket lookup does not filter by status,
   * so a Closed docket is still found and reconciled, not treated as
   * missing.
   */
  async processRow(csvRow, headerRow, lookupCache, userId) {
    const rowData = mapDfcsCsvRowToData(csvRow, lookupCache.dfcsCaseTypeSet);
    if (!rowData.refno) return { skipped: true };

    const validation = this.validateRow(rowData, lookupCache);
    if (!validation.valid) {
      return { error: createErrorRecord(csvRow, headerRow, validation.message) };
    }

    const existingDocket = await Docket.findOne({
      where: {
        agencyRefNumber: rowData.refno,
        caseType: rowData.casecode,
        refAgency: rowData.agency,
      },
      attributes: ['caseId'],
    });

    if (!existingDocket) {
      return {
        error: createErrorRecord(csvRow, headerRow, 'This Docket with Agency Ref Number and Case Type was not found.'),
      };
    }

    const documentIssue = await this.reconcileDocuments(existingDocket.caseId, rowData, csvRow, headerRow, userId);
    return documentIssue ? { found: true, error: documentIssue } : { found: true };
  }

  /**
   * Look up the case's DHS S3 folder, attach any newly-matched documents to
   * the docket, and report if either required document type is still missing.
   * Returns an error record for the report, or null if everything is in order.
   */
  async reconcileDocuments(caseId, rowData, csvRow, headerRow, userId) {
    let matchedDocuments;
    try {
      matchedDocuments = await findMatchingDocuments(rowData.refno, rowData.casecode);
    } catch (error) {
      this.logError('dfcsMissingDocService.reconcileDocuments (S3 lookup)', error);
      return createErrorRecord(csvRow, headerRow, 'Unable to check S3 for documents for this case. Please try again.');
    }

    if (matchedDocuments.length === 0) {
      return createErrorRecord(csvRow, headerRow, NO_DOCUMENTS_FOUND_MESSAGE);
    }

    const foundTypes = new Set(matchedDocuments.map((doc) => doc.documentType));
    for (const document of matchedDocuments) {
      await attachDocumentIfNew(caseId, document, rowData, userId);
    }

    const missingTypes = getMissingRequiredDocumentTypes([...foundTypes]);
    if (missingTypes.length > 0) {
      return createErrorRecord(csvRow, headerRow, buildMissingDocumentMessage(missingTypes));
    }

    return null;
  }

  /**
   * Validate CSV row data (mandatory fields, casetype, county, dates, emails).
   * No agency-existence or duplicate-docket check here — unlike the DFCS
   * import, this flow expects the docket to already exist.
   */
  validateRow(rowData, lookupCache) {
    const missingFields = [];
    if (!rowData.dateReceived) missingFields.push('Date Received');
    if (!rowData.dateRequested) missingFields.push('Date Requested');
    if (!rowData.petitionerLastName?.trim()) missingFields.push('Petitioner Last Name');
    if (!rowData.petitionerFirstName?.trim()) missingFields.push('Petitioner First Name');
    if (!rowData.petitionerAddress1?.trim()) missingFields.push('Petitioner Address 1');
    if (!rowData.petitionerCity?.trim()) missingFields.push('Petitioner City');
    if (!rowData.petitionerState?.trim()) missingFields.push('Petitioner State');
    if (!rowData.petitionerZip?.trim()) missingFields.push('Petitioner Zip');
    if (!rowData.caseWorkerLastName?.trim()) missingFields.push('Case Worker Last Name');
    if (!rowData.caseWorkerFirstName?.trim()) missingFields.push('Case Worker First Name');
    if (!rowData.caseWorkerAddress1?.trim()) missingFields.push('Case Worker Address 1');
    if (!rowData.caseWorkerCity?.trim()) missingFields.push('Case Worker City');
    if (!rowData.caseWorkerState?.trim()) missingFields.push('Case Worker State');
    if (!rowData.caseWorkerZip?.trim()) missingFields.push('Case Worker Zip');
    if (missingFields.length > 0) {
      return { valid: false, message: ERROR_MESSAGES.MANDATORY_FIELDS(missingFields) };
    }

    if (!lookupCache.casetypeSet.has(rowData.casecode?.toUpperCase())) {
      return { valid: false, message: `CaseType not found: ${rowData.casecode}` };
    }

    if (!lookupCache.countyMap.has(rowData.county?.toUpperCase())) {
      return { valid: false, message: `County not found: ${rowData.county}` };
    }

    const dateErrors = [];
    const dateReceivedValidation = validateHearingDateFormat(rowData.dateReceived);
    if (!dateReceivedValidation.valid) dateErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(`Date Received: ${dateReceivedValidation.error}`));
    const dateRequestedValidation = validateHearingDateFormat(rowData.dateRequested);
    if (!dateRequestedValidation.valid) dateErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(`Date Requested: ${dateRequestedValidation.error}`));
    if (dateErrors.length > 0) {
      return { valid: false, message: dateErrors.join('; ') };
    }

    // Legacy uses one generic message for the row if any of the three is invalid, not a
    // field-specific one (OsahformController.php:9457-9528, uploadDfcsMAction).
    const emailValues = [rowData.petitionerEmail, rowData.petitionerAttorneyEmail, rowData.petitionerRepEmail];
    if (emailValues.some((value) => value && !isValidEmail(value))) {
      return { valid: false, message: ERROR_MESSAGES.INVALID_EMAIL };
    }

    return { valid: true };
  }
}

export default new DfcsMissingDocService();
