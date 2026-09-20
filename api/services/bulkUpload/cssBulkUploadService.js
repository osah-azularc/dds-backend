import { Docket, JudgeAssistantClerk } from '../../models/index.js';
import County from '../../models/County.js';
import CourtLocations from '../../models/CourtLocations.js';
import { Op } from 'sequelize';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';
import BaseBulkUploadService from './BaseBulkUploadService.js';
import {
  parseHearingDate,
  parseHearingTime,
  parseCounty,
  createErrorRecord,
  validateHearingDateFormat,
  normalizeKey,
  ERROR_MESSAGES,
} from './bulkUploadCommonHelpers.js';
import { CSS_CONSTANTS, mapCsvRowToData } from './cssHelpers.js';
import { createCustodialParent, createMinorRecords } from './cssPartyFactory.js';
import { getNOHTemplateDoc } from '../nohDocumentService.js';
import { generateNOHForDocket } from '../../helpers/nohGenerationHelper.js';
import { generateBulkMailBatchTimestamp } from './bulkMailFolderService.js';

/**
 * CSS Bulk Upload Service
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 * Handles bulk import of Child Support Services (CSS) dockets from CSV files
 * Legacy: OsahformController::uploadExcelsheetAction()
 * Extends BaseBulkUploadService for common functionality
 */
class CssBulkUploadService extends BaseBulkUploadService {
  /** Main entry point for CSS EST bulk import */
  async importCSSEST(filePath, user = null) {
    const results = this.initializeResults();
    // Checked against the same mapping tables generateImportNOH generates from (see below).
    results.automationFlag = await this.checkAutomationFlag();

    // Read and validate CSV using base class method
    const { headerRow, rows } = await this.readCSVFile(filePath, CSS_CONSTANTS.REQUIRED_COLUMNS);
    results.header = headerRow;

    // Pre-fetch lookup data for performance optimization
    const lookupCache = await this.buildLookupCache(rows);

    // One shared batch folder for every NOH letter this import generates (mirrors legacy).
    const bulkMailBatchTimestamp = results.automationFlag === 'true' ? generateBulkMailBatchTimestamp() : null;

    // Process rows and collect errors
    const { duplicateRecords, validationErrorRecords, missingFieldErrorRecords, docketCreatedCount, nohCaseIds } =
      await this.processRows(rows, headerRow, user, lookupCache, results.automationFlag, bulkMailBatchTimestamp);

    // Build final results
    const finalResults = this.buildResults(results, {
      duplicateRecords,
      validationErrorRecords,
      missingFieldErrorRecords,
      docketCreatedCount,
      totalRowCount: rows.length,
    });

    // Docket creation is done and finalResults is ready to return — generate NOH
    // letters in the background from here on, so large automation-enabled imports
    // don't risk an HTTP/proxy timeout waiting on synchronous PDF/S3 work per row.
    this.runNOHGenerationInBackground(nohCaseIds, this.generateImportNOH.bind(this), user, bulkMailBatchTimestamp, CSS_CONSTANTS.AGENCY);

    return finalResults;
  }

  /** Build lookup cache for judges, locations, and existing dockets (3 batch queries) */
  async buildLookupCache(rows) {
    const rowsData = rows.map(mapCsvRowToData);

    // Collect unique refnos for batch duplicate check. No .filter(Boolean) — Ref# isn't
    // a mandatory field (matches legacy), so a blank Ref# is a legitimate value that
    // must still be included, otherwise a blank-Ref# row can never be matched against
    // a blank-Ref# docket from a prior import and duplicate detection silently no-ops
    // for it (legacy's per-row SQL query runs unconditionally, blank or not).
    const refnos = [...new Set(rowsData.map(r => r.refno))];

    // Batch query: Get all existing open dockets for these refnos
    const existingDockets = await Docket.findAll({
      attributes: ['agencyRefNumber'],
      where: {
        agencyRefNumber: { [Op.in]: refnos },
        caseType: CSS_CONSTANTS.CASE_TYPE,
        refAgency: CSS_CONSTANTS.AGENCY,
        status: { [Op.ne]: CSS_CONSTANTS.STATUS.CLOSED },
      },
      raw: true,
    });
    const existingDocketSet = new Set(existingDockets.map(d => d.agencyRefNumber));

    // Batch query: Get all active judges. Map (not Set) keyed by normalized name so a
    // CSV row with different casing can still match — validateRowWithCache then uses the
    // matched entry's own DB spelling to overwrite rowData before docket creation, so a
    // case-different CSV value never ends up stored verbatim (see validateRowWithCache).
    const judges = await JudgeAssistantClerk.findAll({
      attributes: ['firstName', 'lastName'],
      where: { isActive: '1' },
      raw: true,
    });
    const judgeMap = new Map(
      judges.map(j => [`${normalizeKey(j.firstName)}|${normalizeKey(j.lastName)}`, { firstName: j.firstName, lastName: j.lastName }]),
    );

    // Batch query: Get all active locations (same canonicalize-on-match treatment)
    const locations = await CourtLocations.findAll({
      attributes: ['locationName'],
      where: { isActive: '1' },
      raw: true,
    });
    const locationMap = new Map(locations.map(l => [normalizeKey(l.locationName), l.locationName]));

    return { existingDocketSet, judgeMap, locationMap };
  }

  /** Check if NOH automation is enabled */
  async checkAutomationFlag() {
    try {
      const hasAutomation = await this.checkNohAutomationEnabled();
      return hasAutomation ? 'true' : 'false';
    } catch (error) {
      logger.warn('NOH automation check failed:', { error: error.message });
      return 'false';
    }
  }

  /** Process all CSV rows using pre-built lookup cache */
  async processRows(rows, headerRow, user, lookupCache, automationFlag = 'false', bulkMailBatchTimestamp = null) {
    const duplicateRecords = [];
    const validationErrorRecords = [];
    const missingFieldErrorRecords = [];
    let docketCreatedCount = 0;

    // Track newly created dockets to prevent duplicates within same batch
    const createdRefnos = new Set();
    // Mirrors PHP NOHAutomation() called per imported docket — collected here and
    // generated in the background after the response is built (see importCSSEST).
    const nohCaseIds = [];

    for (const csvRow of rows) {
      const rowData = mapCsvRowToData(csvRow);
      const validationResult = this.validateRowWithCache(rowData, csvRow, headerRow, lookupCache, createdRefnos);

      if (validationResult.error) {
        if (validationResult.type === 'duplicate') {
          duplicateRecords.push(validationResult.error);
        } else if (validationResult.type === 'validation') {
          validationErrorRecords.push(validationResult.error);
        } else {
          missingFieldErrorRecords.push(validationResult.error);
        }
        continue;
      }

      // Create docket with all related records
      const createResult = await this.createDocketWithDetails(rowData, csvRow, headerRow, user);
      if (createResult.success) {
        docketCreatedCount++;
        // Track created refno to prevent duplicates within same batch
        createdRefnos.add(rowData.refno);

        if (automationFlag === 'true') {
          nohCaseIds.push(createResult.caseId);
        }
      } else {
        missingFieldErrorRecords.push(createResult.error);
      }
    }

    return { duplicateRecords, validationErrorRecords, missingFieldErrorRecords, docketCreatedCount, nohCaseIds };
  }

  /** Auto-generate the NOH document for a docket just created by the import. */
  async generateImportNOH(caseId, user, bulkMailBatchTimestamp) {
    const username = user?.email ? user.email.split('@')[0] : 'system';
    const userId = user?.user_id ?? user?.id ?? user?.userId ?? 0;

    const result = await generateNOHForDocket(
      caseId, CSS_CONSTANTS.AGENCY, CSS_CONSTANTS.CASE_TYPE, CSS_CONSTANTS.NOH_AUTOMATION_SUB_TYPE,
      {
        username, userId, bulkFlag: '1', bulkMailBatchTimestamp,
        // CSS EST's sole recipient is always the Respondent (custodial parent) — see mailer_contact in legacy.
        bulkMailIsRespondentCopy: true,
        // Legacy never queues CSS EST into ecourt_mailvendor_documents (that block is OIG-only).
        enableMailVendorQueue: false,
      },
    );

    if (!result.success) {
      logger.warn(`NOH auto-generation failed for imported docket ${caseId}:`, { reason: result.reason });
    }
  }

  /** Validate a single row using pre-built lookup cache (synchronous - no DB queries) */
  validateRowWithCache(rowData, csvRow, headerRow, lookupCache, createdRefnos) {
    const { existingDocketSet, judgeMap, locationMap } = lookupCache;

    // Check for duplicate (from pre-fetched data or current batch)
    if (existingDocketSet.has(rowData.refno) || createdRefnos.has(rowData.refno)) {
      return { type: 'duplicate', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DUPLICATE(rowData.refno)) };
    }

    // Check required fields and collect missing ones
    const missingFields = [];
    if (!rowData.hearingDate || rowData.hearingDate.trim() === '') missingFields.push('Hearing Date');
    if (!rowData.hearingTime || rowData.hearingTime.trim() === '') missingFields.push('Hearing Time');
    if (!rowData.hearingLocation) missingFields.push('Hearing Location');
    if (!rowData.judgeName || rowData.judgeName.trim() === '') missingFields.push('Judge Name');
    if (!rowData.assistantName || rowData.assistantName.trim() === '') missingFields.push('Judge Assistant');

    if (missingFields.length > 0) {
      return { type: 'missing', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.MANDATORY_FIELDS(missingFields)) };
    }

    // Collect all validation errors using cached lookups (no DB queries)
    const validationErrors = [];

    // Validate hearing date format (MM-DD-YYYY or MM/DD/YYYY)
    const dateValidation = validateHearingDateFormat(rowData.hearingDate);
    if (!dateValidation.valid) {
      validationErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(dateValidation.error));
    }

    // Validate judge exists using cache (case-insensitive; canonicalize rowData to the
    // judge's own DB spelling on a match so the docket is never written with the CSV's casing)
    const judgeKey = `${normalizeKey(rowData.judgeFirstName)}|${normalizeKey(rowData.judgeLastName)}`;
    const matchedJudge = judgeMap.get(judgeKey);
    if (!matchedJudge) {
      validationErrors.push(ERROR_MESSAGES.JUDGE_NOT_FOUND(rowData.judgeName));
    } else {
      rowData.judgeFirstName = matchedJudge.firstName;
      rowData.judgeLastName = matchedJudge.lastName;
      rowData.judgeName = `${matchedJudge.lastName} ${matchedJudge.firstName}`;
    }

    // Validate location exists using cache (same canonicalize-on-match treatment)
    const matchedLocation = locationMap.get(normalizeKey(rowData.hearingLocation));
    if (!matchedLocation) {
      validationErrors.push(ERROR_MESSAGES.LOCATION_NOT_FOUND(rowData.hearingLocation));
    } else {
      rowData.hearingLocation = matchedLocation;
    }

    // Return all validation errors at once
    if (validationErrors.length > 0) {
      return { type: 'validation', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.VALIDATION_ERRORS(validationErrors)) };
    }

    return { valid: true };
  }

  /** Create docket with all related records in a transaction */
  async createDocketWithDetails(rowData, csvRow, headerRow, user) {
    const transaction = await mysqlSequelize.transaction();

    try {
      const hearingDate = parseHearingDate(csvRow[25]);
      const hearingTime = parseHearingTime(csvRow[26]);
      const county = parseCounty(csvRow[27]);
      const countyRecord = await County.findOne({ where: { countyDescription: county } });
      const countyId = countyRecord?.countyId || 'UNASSIGNED';
      const currentDatetime = new Date();

      // Create docket
      const newDocket = await this.createDocketRecord(rowData, { hearingDate, hearingTime, county, user, currentDatetime }, transaction);

      // Update docket number
      const docketNumber = `${rowData.agency}-${rowData.casecode}-${newDocket.caseId}-${countyId}-${rowData.judgeLastName}`;
      await Docket.update({ docketNumber }, { where: { caseId: newDocket.caseId }, transaction });

      // Create open/close details
      await this.createOpenCloseDetails(newDocket.caseId, user, currentDatetime, transaction);

      // Create custodial parent
      const caseName = await createCustodialParent(newDocket.caseId, rowData, currentDatetime, transaction);
      await Docket.update({ caseName }, { where: { caseId: newDocket.caseId }, transaction });

      // Create minors
      await createMinorRecords(newDocket.caseId, rowData, currentDatetime, transaction);

      await transaction.commit();
      return { success: true, caseId: newDocket.caseId };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating docket:', { error: error.message });
      return { success: false, error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DOCKET_FAILED(error.message)) };
    }
  }

  /** Create the main docket record */
  async createDocketRecord(rowData, { hearingDate, hearingTime, county, user, currentDatetime }, transaction) {
    return Docket.create({
      refAgency: rowData.agency,
      caseType: rowData.casecode,
      county,
      dateRequested: currentDatetime.toISOString().slice(0, 10),
      agencyRefNumber: rowData.refno,
      hearingMode: CSS_CONSTANTS.HEARING_MODE,
      dateReceivedByOSAH: currentDatetime.toISOString().slice(0, 10),
      judge: rowData.judgeName,
      judgeAssistant: rowData.assistantName,
      hearingSite: rowData.hearingLocation,
      hearingTime,
      hearingDate,
      docketClerk: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined : undefined,
      telvOFive: '1',
      status: CSS_CONSTANTS.STATUS.HEARING_SCHEDULED,
      docketCreatedDate: currentDatetime,
    }, { transaction });
  }

  // Note: createOpenCloseDetails and buildResults inherited from BaseBulkUploadService
  // Note: createCustodialParent and createMinorRecords delegated to cssPartyFactory

  /** Whether an NOH template is configured for CSS EST / "In Person Hearing". */
  async checkNohAutomationEnabled() {
    const templateDoc = await getNOHTemplateDoc(CSS_CONSTANTS.AGENCY, CSS_CONSTANTS.CASE_TYPE, CSS_CONSTANTS.NOH_AUTOMATION_SUB_TYPE);
    return !!templateDoc;
  }
}

export default new CssBulkUploadService();
