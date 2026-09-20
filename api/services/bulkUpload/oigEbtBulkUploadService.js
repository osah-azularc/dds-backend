import { Docket, JudgeAssistantClerk } from '../../models/index.js';
import County from '../../models/County.js';
import Agency from '../../models/admin/agencyModel.js';
import Casetypes from '../../models/Casetypes.js';
import AgencyCaseworkerByCaseMaster from '../../models/admin/agencyCaseworkerByCaseMasterModel.js';
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
import { OIG_EBT_CONSTANTS, mapOigEbtCsvRowToData } from './oigEbtHelpers.js';
import { createRespondent, createInvestigator } from './oigEbtPartyFactory.js';
import { getNOHTemplateDoc } from '../nohDocumentService.js';
import { generateNOHForDocket } from '../../helpers/nohGenerationHelper.js';
import { generateBulkMailBatchTimestamp } from './bulkMailFolderService.js';

/**
 * OIG EBT Bulk Upload Service
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 * Handles bulk import of OIG EBTFSF dockets (27 cols). Investigator stored in
 * agencycaseworkerbycase; respondent stored in peopledetails.
 * Legacy: OsahformController::uploadcasesAction()
 */
class OigEbtBulkUploadService extends BaseBulkUploadService {
  /** Main entry point for OIG EBT bulk import */
  async importOIGEBT(filePath, user = null) {
    const results = this.initializeResults();
    results.automationFlag = await this.checkAutomationFlag();

    // Read and validate CSV using base class method
    const { headerRow, rows } = await this.readCSVFile(filePath, OIG_EBT_CONSTANTS.REQUIRED_COLUMNS);
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
    this.runNOHGenerationInBackground(nohCaseIds, this.generateImportNOH.bind(this), user, bulkMailBatchTimestamp, OIG_EBT_CONSTANTS.AGENCY);

    return finalResults;
  }

  /** Build lookup cache for judges, locations, agencies, and existing dockets */
  async buildLookupCache(rows) {
    const rowsData = rows.map(mapOigEbtCsvRowToData);
    // No .filter(Boolean) here — unlike agency/casecode/county, Ref# isn't a mandatory
    // field (matches legacy), so a blank Ref# is a valid, legitimate value that must
    // still be included in the existing-docket lookup below. Dropping it would let a
    // blank-Ref# row bypass duplicate detection entirely (legacy's per-row SQL query
    // runs unconditionally, blank or not — see OsahformController::uploadcasesAction).
    const refnos = [...new Set(rowsData.map(r => r.refno))];
    const agencies = [...new Set(rowsData.map(r => r.agency).filter(Boolean))];
    const casecodes = [...new Set(rowsData.map(r => r.casecode).filter(Boolean))];
    const counties = [...new Set(rowsData.map(r => r.county).filter(Boolean))];

    const existingDockets = await Docket.findAll({
      attributes: ['agencyRefNumber'],
      where: {
        agencyRefNumber: { [Op.in]: refnos },
        caseType: OIG_EBT_CONSTANTS.CASE_TYPE,
        refAgency: OIG_EBT_CONSTANTS.AGENCY,
        status: { [Op.ne]: OIG_EBT_CONSTANTS.STATUS.CLOSED },
      },
      raw: true,
    });
    const existingDocketSet = new Set(existingDockets.map(d => d.agencyRefNumber));

    // No isActive filter — legacy's judge_assistant_clerk_concat lookup matches any row regardless of status.
    // Map (not Set) keyed by normalized name — see validateRowWithCache: on a match, rowData is
    // overwritten with the matched record's own DB spelling, so the docket is never written
    // with a CSV-cased guess even though the lookup itself tolerates a casing difference.
    const judges = await JudgeAssistantClerk.findAll({ attributes: ['firstName', 'lastName'], raw: true });
    const judgeMap = new Map(
      judges.map(j => [`${normalizeKey(j.firstName)}|${normalizeKey(j.lastName)}`, { firstName: j.firstName, lastName: j.lastName }]),
    );

    const agencyRecords = await Agency.findAll({ attributes: ['agencyCode'], where: { agencyCode: { [Op.in]: agencies } }, raw: true });
    const agencyMap = new Map(agencyRecords.map(a => [normalizeKey(a.agencyCode), a.agencyCode]));

    const casetypeRecords = await Casetypes.findAll({ attributes: ['caseCode'], where: { caseCode: { [Op.in]: casecodes } }, raw: true });
    const casetypeMap = new Map(casetypeRecords.map(c => [normalizeKey(c.caseCode), c.caseCode]));

    const countyRecords = await County.findAll({ attributes: ['countyDescription', 'countyId'], where: { countyDescription: { [Op.in]: counties } }, raw: true });
    const countyMap = new Map(countyRecords.map(c => [normalizeKey(c.countyDescription), { countyId: c.countyId, countyDescription: c.countyDescription }]));

    const investigatorMasters = await AgencyCaseworkerByCaseMaster.findAll({
      attributes: ['firstName', 'lastName', 'address1', 'typeOfContact'],
      where: { typeOfContact: OIG_EBT_CONSTANTS.PARTY_TYPE.INVESTIGATOR },
      raw: true,
    });
    const investigatorMasterSet = new Set(
      investigatorMasters.map((m) => `${m.firstName}|${m.lastName}|${m.address1}|${m.typeOfContact}`)
    );

    return {
      existingDocketSet, judgeMap, agencyMap, casetypeMap, countyMap,
      investigatorMasterSet, createdMasterKeys: new Set(),
    };
  }

  /** Check if an NOH template is configured for OIG EBTFSF / "In Person Hearing". */
  async checkAutomationFlag() {
    try {
      const templateDoc = await getNOHTemplateDoc(OIG_EBT_CONSTANTS.AGENCY, OIG_EBT_CONSTANTS.CASE_TYPE, OIG_EBT_CONSTANTS.NOH_AUTOMATION_SUB_TYPE);
      return templateDoc ? 'true' : 'false';
    } catch (error) {
      logger.warn('NOH automation check failed:', { error: error.message });
      return 'false';
    }
  }

  /** Auto-generate the NOH document for a docket just created by the import. */
  async generateImportNOH(caseId, user, bulkMailBatchTimestamp) {
    const username = user?.email ? user.email.split('@')[0] : 'system';
    const userId = user?.user_id ?? user?.id ?? user?.userId ?? 0;

    const result = await generateNOHForDocket(
      caseId, OIG_EBT_CONSTANTS.AGENCY, OIG_EBT_CONSTANTS.CASE_TYPE, OIG_EBT_CONSTANTS.NOH_AUTOMATION_SUB_TYPE,
      {
        username, userId, bulkFlag: '1', bulkMailBatchTimestamp,
        // Legacy also drops an untracked Respondent-addressed copy (sk=2) into Bulkdocs only,
        // beyond the canonical Investigator (sk=1) letter — mailer_contact='Investigator+Respondent'.
        bulkMailExtraCopies: [{ recipientIndex: 2, isRespondentCopy: true }],
      },
    );

    if (!result.success) {
      logger.warn(`NOH auto-generation failed for imported docket ${caseId}:`, { reason: result.reason });
    }
  }

  /** Bucket a row's validation error into the right report array. */
  collectValidationError(validationResult, buckets) {
    if (validationResult.type === 'duplicate') {
      buckets.duplicateRecords.push(validationResult.error);
    } else if (validationResult.type === 'validation') {
      buckets.validationErrorRecords.push(validationResult.error);
    } else {
      buckets.missingFieldErrorRecords.push(validationResult.error);
    }
  }

  /** Process all CSV rows using pre-built lookup cache */
  async processRows(rows, headerRow, user, lookupCache, automationFlag = 'false', bulkMailBatchTimestamp = null) {
    const buckets = { duplicateRecords: [], validationErrorRecords: [], missingFieldErrorRecords: [] };
    let docketCreatedCount = 0;
    const createdRefnos = new Set();
    // Mirrors PHP NOHAutomation() called per imported docket — collected here and
    // generated in the background after the response is built (see importOIGEBT).
    const nohCaseIds = [];

    for (const csvRow of rows) {
      const rowData = mapOigEbtCsvRowToData(csvRow);
      const validationResult = this.validateRowWithCache(rowData, csvRow, headerRow, lookupCache, createdRefnos);

      if (validationResult.skip) continue;

      if (validationResult.error) {
        this.collectValidationError(validationResult, buckets);
        continue;
      }

      const createResult = await this.createDocketWithDetails(rowData, csvRow, headerRow, user, lookupCache);
      if (!createResult.success) {
        buckets.missingFieldErrorRecords.push(createResult.error);
        continue;
      }

      docketCreatedCount++;
      createdRefnos.add(rowData.refno);

      if (automationFlag === 'true') {
        nohCaseIds.push(createResult.caseId);
      }
    }

    return { ...buckets, docketCreatedCount, nohCaseIds };
  }

  /** Validate a single row using pre-built lookup cache */
  validateRowWithCache(rowData, csvRow, headerRow, lookupCache, createdRefnos) {
    const { existingDocketSet, judgeMap, agencyMap, casetypeMap, countyMap } = lookupCache;

    if (!rowData.hearingDate || rowData.hearingDate.trim() === '') {
      return { valid: true, skip: true };
    }

    if (existingDocketSet.has(rowData.refno) || createdRefnos.has(rowData.refno)) {
      return { type: 'duplicate', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DUPLICATE(rowData.refno)) };
    }

    const missingFields = [];
    if (!rowData.hearingDate) missingFields.push('Hearing Date');
    if (!rowData.hearingTime) missingFields.push('Hearing Time');
    if (!rowData.judgeName || rowData.judgeName.trim() === '') missingFields.push('Judge Name');
    if (!rowData.assistantName || rowData.assistantName.trim() === '') missingFields.push('Judge Assistant');
    if (!rowData.hearingLocation) missingFields.push('Hearing Location');
    if (!rowData.agency) missingFields.push('Agency');
    if (!rowData.casecode) missingFields.push('Case Code');
    if (!rowData.county) missingFields.push('County');

    if (missingFields.length > 0) {
      return { type: 'missing', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.MANDATORY_FIELDS(missingFields)) };
    }

    const validationErrors = [];

    const dateValidation = validateHearingDateFormat(rowData.hearingDate);
    if (!dateValidation.valid) validationErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(dateValidation.error));

    // Each lookup below is case-insensitive; on a match, rowData is overwritten with the
    // matched record's own DB spelling so the docket is never written with the CSV's casing.
    const matchedAgency = agencyMap.get(normalizeKey(rowData.agency));
    if (!matchedAgency) {
      validationErrors.push('Agency details not found');
    } else {
      rowData.agency = matchedAgency;
    }

    const matchedCasetype = casetypeMap.get(normalizeKey(rowData.casecode));
    if (!matchedCasetype) {
      validationErrors.push('Case code not found');
    } else {
      rowData.casecode = matchedCasetype;
    }

    const matchedCounty = countyMap.get(normalizeKey(rowData.county));
    if (!matchedCounty) {
      validationErrors.push('County details not found');
    } else {
      rowData.county = matchedCounty.countyDescription;
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

    const assistantKey = `${normalizeKey(rowData.assistantFirstName)}|${normalizeKey(rowData.assistantLastName)}`;
    const matchedAssistant = judgeMap.get(assistantKey);
    if (!matchedAssistant) {
      validationErrors.push('Assistant details not found');
    } else {
      rowData.assistantFirstName = matchedAssistant.firstName;
      rowData.assistantLastName = matchedAssistant.lastName;
      rowData.assistantName = `${matchedAssistant.lastName} ${matchedAssistant.firstName}`;
    }

    if (validationErrors.length > 0) {
      return { type: 'validation', error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.VALIDATION_ERRORS(validationErrors)) };
    }

    return { valid: true };
  }

  /** Create docket with all related records in a transaction */
  async createDocketWithDetails(rowData, csvRow, headerRow, user, lookupCache) {
    const transaction = await mysqlSequelize.transaction();

    try {
      const hearingDate = parseHearingDate(rowData.hearingDate);
      const hearingTime = parseHearingTime(rowData.hearingTime);
      const dateReceived = parseHearingDate(rowData.dateReceived);
      const dateRequested = parseHearingDate(rowData.dateRequested);
      // rowData.county was already canonicalized to the matched DB record's own spelling in
      // validateRowWithCache, so this re-lookup always hits — kept as a lookup (rather than
      // threading the countyId through from validation) since createDocketWithDetails only
      // receives rowData, not the validation result.
      const countyId = lookupCache.countyMap.get(normalizeKey(rowData.county))?.countyId || 'UNASSIGNED';
      const currentDatetime = new Date();

      const newDocket = await this.createDocketRecord(rowData, {
        hearingDate, hearingTime, dateReceived, dateRequested, user, currentDatetime,
      }, transaction);

      // Docket number: OIG-EBTFSF-{caseId}-{countyId}-{judgeLN}
      const docketNumber = `${rowData.agency}-${rowData.casecode}-${newDocket.caseId}-${countyId}-${rowData.judgeLastName}`;
      await Docket.update({ docketNumber }, { where: { caseId: newDocket.caseId }, transaction });
      await this.createOpenCloseDetails(newDocket.caseId, user, currentDatetime, transaction);

      const caseName = await createRespondent(newDocket.caseId, rowData, currentDatetime, transaction);
      await Docket.update({ caseName }, { where: { caseId: newDocket.caseId }, transaction });

      const stateRepresentative = await createInvestigator(newDocket.caseId, rowData, currentDatetime, transaction, lookupCache);
      await Docket.update({ stateRepresentative }, { where: { caseId: newDocket.caseId }, transaction });

      await transaction.commit();
      return { success: true, caseId: newDocket.caseId };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating OIG EBT docket:', { error: error.message });
      return { success: false, error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DOCKET_FAILED(error.message)) };
    }
  }

  /** Create the main docket record */
  async createDocketRecord(rowData, { hearingDate, hearingTime, dateReceived, dateRequested, user, currentDatetime }, transaction) {
    return Docket.create({
      refAgency: rowData.agency,
      caseType: rowData.casecode,
      county: rowData.county,
      dateRequested: dateRequested || currentDatetime,
      agencyRefNumber: rowData.refno,
      hearingMode: OIG_EBT_CONSTANTS.HEARING_MODE,
      dateReceivedByOSAH: dateReceived || currentDatetime,
      judge: rowData.judgeName,
      judgeAssistant: rowData.assistantName,
      hearingSite: rowData.hearingLocation,
      hearingTime,
      hearingDate,
      docketClerk: rowData.docketClerk || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined),
      telvOFive: '1',
      status: OIG_EBT_CONSTANTS.STATUS.HEARING_SCHEDULED,
      docketCreatedDate: currentDatetime,
    }, { transaction });
  }

}

export default new OigEbtBulkUploadService();

