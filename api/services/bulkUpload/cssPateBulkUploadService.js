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
  createErrorRecord,
  validateHearingDateFormat,
  normalizeKey,
  ERROR_MESSAGES,
} from './bulkUploadCommonHelpers.js';
import { CSS_PATE_CONSTANTS, mapPateCsvRowToData } from './cssPateHelpers.js';
import { createCustodialParent, createRespondent, createMinorRecords } from './cssPatePartyFactory.js';

/**
 * CSS PAT-E Bulk Upload Service
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 * Handles bulk import of Child Support Services (CSS) PAT-E (Paternity Establishment) dockets
 * Legacy: BulkuploadController::uploadcsspeteAction()
 * Extends BaseBulkUploadService for common functionality
 */
class CssPateBulkUploadService extends BaseBulkUploadService {
  /**
   * Main entry point for CSS PAT-E bulk import
   */
  async importCSSPATE(filePath, user = null) {
    const results = this.initializeResults();

    // Read and validate CSV using base class method
    const { headerRow, rows } = await this.readCSVFile(filePath, CSS_PATE_CONSTANTS.REQUIRED_COLUMNS);
    results.header = headerRow;

    // Pre-fetch lookup data for performance optimization
    const lookupCache = await this.buildLookupCache(rows);

    // Process rows and collect errors
    const { duplicateRecords, validationErrorRecords, missingFieldErrorRecords, docketCreatedCount } =
      await this.processRows(rows, headerRow, user, lookupCache);

    // Build final results
    return this.buildResults(results, {
      duplicateRecords,
      validationErrorRecords,
      missingFieldErrorRecords,
      docketCreatedCount,
      totalRowCount: rows.length,
    });
  }

  /**
   * Build lookup cache for judges, locations, and existing dockets
   */
  async buildLookupCache(rows) {
    const rowsData = rows.map(mapPateCsvRowToData);
    // No .filter(Boolean) — Ref# isn't a mandatory field (matches legacy), so a blank
    // Ref# is a legitimate value that must still be included, otherwise a blank-Ref#
    // row can never be matched against a blank-Ref# docket from a prior import and
    // duplicate detection silently no-ops for it (legacy's per-row SQL query runs
    // unconditionally, blank or not).
    const refnos = [...new Set(rowsData.map(r => r.refno))];

    // Batch query: Get existing open dockets for these refnos
    const existingDockets = await Docket.findAll({
      attributes: ['agencyRefNumber'],
      where: {
        agencyRefNumber: { [Op.in]: refnos },
        caseType: CSS_PATE_CONSTANTS.CASE_TYPE,
        refAgency: CSS_PATE_CONSTANTS.AGENCY,
        status: { [Op.ne]: CSS_PATE_CONSTANTS.STATUS.CLOSED },
      },
      raw: true,
    });
    const existingDocketSet = new Set(existingDockets.map(d => d.agencyRefNumber));

    // Batch query: Get all active judges. Map (not Set) keyed by normalized name — see
    // cssBulkUploadService.js's buildLookupCache for why (canonicalize-on-match).
    const judges = await JudgeAssistantClerk.findAll({
      attributes: ['firstName', 'lastName'],
      where: { isActive: '1' },
      raw: true,
    });
    const judgeMap = new Map(
      judges.map(j => [`${normalizeKey(j.firstName)}|${normalizeKey(j.lastName)}`, { firstName: j.firstName, lastName: j.lastName }]),
    );

    // Batch query: Get all active locations
    const locations = await CourtLocations.findAll({
      attributes: ['locationName'],
      where: { isActive: '1' },
      raw: true,
    });
    const locationMap = new Map(locations.map(l => [normalizeKey(l.locationName), l.locationName]));

    return { existingDocketSet, judgeMap, locationMap };
  }

  // Note: initializeResults and readCSVFile inherited from BaseBulkUploadService

  /**
   * Process all CSV rows using pre-built lookup cache
   */
  async processRows(rows, headerRow, user, lookupCache) {
    const duplicateRecords = [];
    const validationErrorRecords = [];
    const missingFieldErrorRecords = [];
    let docketCreatedCount = 0;
    const createdRefnos = new Set();

    for (const csvRow of rows) {
      const rowData = mapPateCsvRowToData(csvRow);
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

      const createResult = await this.createDocketWithDetails(rowData, csvRow, headerRow, user);
      if (createResult.success) {
        docketCreatedCount++;
        createdRefnos.add(rowData.refno);
      } else {
        missingFieldErrorRecords.push(createResult.error);
      }
    }

    return { duplicateRecords, validationErrorRecords, missingFieldErrorRecords, docketCreatedCount };
  }

  /**
   * Validate a single row using pre-built lookup cache
   */
  validateRowWithCache(rowData, csvRow, headerRow, lookupCache, createdRefnos) {
    const { existingDocketSet, judgeMap, locationMap } = lookupCache;

    // Check for duplicate
    if (existingDocketSet.has(rowData.refno) || createdRefnos.has(rowData.refno)) {
      return { type: 'duplicate', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DUPLICATE(rowData.refno)) };
    }

    // Check required fields (per legacy: judge_name, asst_name, county are mandatory)
    const missingFields = [];
    if (!rowData.judgeName || rowData.judgeName.trim() === '') missingFields.push('Judge Name');
    if (!rowData.assistantName || rowData.assistantName.trim() === '') missingFields.push('Judge Assistant');
    if (!rowData.county || rowData.county.trim() === '') missingFields.push('County');

    if (missingFields.length > 0) {
      return { type: 'missing', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.MANDATORY_FIELDS(missingFields)) };
    }

    // Collect validation errors using cached lookups
    const validationErrors = [];

    // Validate hearing date format if provided
    if (rowData.hearingDate && rowData.hearingDate.trim() !== '') {
      const dateValidation = validateHearingDateFormat(rowData.hearingDate);
      if (!dateValidation.valid) {
        validationErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(dateValidation.error));
      }
    }
    const judgeKey = `${normalizeKey(rowData.judgeFirstName)}|${normalizeKey(rowData.judgeLastName)}`;
    const matchedJudge = judgeMap.get(judgeKey);
    if (!matchedJudge) {
      validationErrors.push(ERROR_MESSAGES.JUDGE_NOT_FOUND(rowData.judgeName));
    } else {
      rowData.judgeFirstName = matchedJudge.firstName;
      rowData.judgeLastName = matchedJudge.lastName;
      rowData.judgeName = `${matchedJudge.lastName} ${matchedJudge.firstName}`;
    }
    if (rowData.hearingLocation) {
      const matchedLocation = locationMap.get(normalizeKey(rowData.hearingLocation));
      if (!matchedLocation) {
        validationErrors.push(ERROR_MESSAGES.LOCATION_NOT_FOUND(rowData.hearingLocation));
      } else {
        rowData.hearingLocation = matchedLocation;
      }
    }

    if (validationErrors.length > 0) {
      return { type: 'validation', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.VALIDATION_ERRORS(validationErrors)) };
    }

    return { valid: true };
  }

  /**
   * Create docket with all related records in a transaction
   */
  async createDocketWithDetails(rowData, csvRow, headerRow, user) {
    const transaction = await mysqlSequelize.transaction();

    try {
      const hearingDate = parseHearingDate(rowData.hearingDate);
      const hearingTime = parseHearingTime(rowData.hearingTime);
      const countyRecord = await County.findOne({ where: { countyDescription: rowData.county } });
      const countyId = countyRecord?.countyId || 'UNASSIGNED';
      const currentDatetime = new Date();

      // Create docket
      const newDocket = await this.createDocketRecord(rowData, { hearingDate, hearingTime, user, currentDatetime }, transaction);

      // Update docket number
      const docketNumber = `${rowData.agency}-${rowData.casecode}-${newDocket.caseId}-${countyId}-${rowData.judgeLastName}`;
      await Docket.update({ docketNumber }, { where: { caseId: newDocket.caseId }, transaction });

      // Create open/close details
      await this.createOpenCloseDetails(newDocket.caseId, user, currentDatetime, transaction);

      // Create Custodial Parent (Petitioner equivalent)
      await createCustodialParent(newDocket.caseId, rowData, currentDatetime, transaction);

      // Create Respondent and get case name
      const caseName = await createRespondent(newDocket.caseId, rowData, currentDatetime, transaction);
      await Docket.update({ caseName }, { where: { caseId: newDocket.caseId }, transaction });

      // Create minors
      await createMinorRecords(newDocket.caseId, rowData, currentDatetime, transaction);

      await transaction.commit();
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating PAT-E docket:', { error: error.message });
      return { success: false, error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DOCKET_FAILED(error.message)) };
    }
  }

  /**
   * Create the main docket record
   */
  async createDocketRecord(rowData, { hearingDate, hearingTime, user, currentDatetime }, transaction) {
    return Docket.create({
      refAgency: rowData.agency,
      caseType: rowData.casecode,
      county: rowData.county,
      dateRequested: currentDatetime.toISOString().slice(0, 10),
      agencyRefNumber: rowData.refno,
      hearingMode: CSS_PATE_CONSTANTS.HEARING_MODE,
      dateReceivedByOSAH: currentDatetime.toISOString().slice(0, 10),
      judge: rowData.judgeName,
      judgeAssistant: rowData.assistantName,
      hearingSite: rowData.hearingLocation,
      hearingTime,
      hearingDate,
      docketClerk: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined : undefined,
      telvOFive: '1',
      status: CSS_PATE_CONSTANTS.STATUS.HEARING_SCHEDULED,
      docketCreatedDate: currentDatetime,
    }, { transaction });
  }

  // Note: createOpenCloseDetails and buildResults inherited from BaseBulkUploadService
  // Note: party / minor creation delegated to cssPatePartyFactory
}

export default new CssPateBulkUploadService();