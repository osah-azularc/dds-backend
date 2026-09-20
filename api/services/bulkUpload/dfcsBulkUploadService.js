import fs from 'fs';
import csv from 'csv-parser';
import { Docket } from '../../models/index.js';
import County from '../../models/County.js';
import Agency from '../../models/admin/agencyModel.js';
import Casetypes from '../../models/Casetypes.js';
import AgencyCaseworkerByCaseMaster from '../../models/admin/agencyCaseworkerByCaseMasterModel.js';
import AttorneyByCaseMaster from '../../models/admin/attorneyByCaseMasterModel.js';
import { Op } from 'sequelize';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import { logger } from '../../../config/winstonLogger.js';
import BaseBulkUploadService from './BaseBulkUploadService.js';
import {
  parseHearingDate,
  createErrorRecord,
  validateHearingDateFormat,
  isValidEmail,
  ERROR_MESSAGES,
} from './bulkUploadCommonHelpers.js';
import { DFCS_CONSTANTS, mapDfcsCsvRowToData, buildMissingDocsMessage } from './dfcsHelpers.js';
import {
  createPetitioner,
  createPetitionerAttorney,
  createRepresentative,
  createCaseWorker,
  createRegionalCoordinator,
} from './dfcsPartyFactory.js';
import { attachDhsDocumentsToDocket } from './dfcsDocumentAttachmentService.js';
import { resolveHearingAssignment } from './dfcsHearingAssignmentService.js';

// Legacy: duplicate check matches agencyrefnumber + casetype + refagency together
// (OsahformController.php:9658-9659), not refno alone.
function buildDuplicateKey(refno, casecode, agency) {
  return `${refno?.toLowerCase()}|${casecode?.toUpperCase()}|${agency?.toUpperCase()}`;
}

/**
 * DFCS Bulk Upload Service
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 * Handles DFCS / DFCS-M case imports with dynamic agency routing.
 * Legacy: OsahformController::uploadDfcsMAction. Extends BaseBulkUploadService.
 */
class DfcsBulkUploadService extends BaseBulkUploadService {
  /**
   * Main entry point for DFCS bulk import
   * Matches OIG service pattern for controller compatibility
   */
  async importDFCS(filePath, user = null) {
    // Base contract (automationFlag, duplicateCheck, noDocFound, missingFieldCheck,
    // fileData, noDocFoundData) instead of a bespoke subset — see code review C-2.
    // DFCS has no NOH automation (omitted from BulkUploadController's NOH_STATUS_SERVICES
    // map; the frontend statically treats DFCS as "always show the disclaimer"), so
    // automationFlag correctly stays at its 'false' default here.
    const results = this.initializeResults();
    const { headerRow, rows } = await this.readDfcsCSVFile(filePath);
    results.header = headerRow;

    // Validate column count. Legacy: uploadDfcsMAction exits immediately on a bad header
    // (OsahformController.php:9022-9024) rather than reporting a partial per-row result —
    // throwing here matches that, and matches CSS/OIG/CSS PAT-E's readCSVFile behavior.
    if (headerRow.length !== DFCS_CONSTANTS.REQUIRED_COLUMNS) {
      throw new Error(ERROR_MESSAGES.INVALID_CSV_DFCS);
    }

    // Build lookup cache and get existing dockets
    const lookupCache = await this.buildLookupCache();
    const existingDocketSet = await this.getExistingDockets();
    const createdRefnos = new Set();

    // Hard-failure counts by type, used below to populate duplicateCheck/missingFieldCheck/
    // noDocFound accurately instead of leaving them at their 'false' default. Kept separate
    // from docWarningCount: a missing DHS document is informational, not a hard failure.
    let duplicateErrorCount = 0;
    let missingFieldErrorCount = 0;
    let validationErrorCount = 0;
    let docWarningCount = 0;

    // Process each row
    for (const csvRow of rows) {
      const rowResult = await this.processRow(csvRow, headerRow, user, lookupCache, existingDocketSet, createdRefnos);
      if (rowResult.created) {
        results.nofDocketCreated++;
        createdRefnos.add(rowResult.created.refno?.toLowerCase());
      }
      if (rowResult.error) {
        results.nofDocketNotCreated++;
        results.errorReport.push(rowResult.error);
        if (rowResult.errorType === 'duplicate') duplicateErrorCount++;
        else if (rowResult.errorType === 'missing') missingFieldErrorCount++;
        else validationErrorCount++; // 'validation' or docket-creation ('creation') failure
      }
      // Missing-DHS-document warning — merged into the same error CSV as everything else
      // (legacy does this too), but doesn't count toward nofDocketNotCreated since the
      // docket itself was created successfully, and must not flip `result` to 'false'
      // for what is, from the caller's perspective, a fully successful import.
      if (rowResult.docWarning) {
        results.errorReport.push(rowResult.docWarning);
        docWarningCount++;
      }
    }

    results.duplicateCheck = duplicateErrorCount > 0 ? 'true' : 'false';
    results.missingFieldCheck = missingFieldErrorCount > 0 ? 'true' : 'false';
    results.noDocFound = validationErrorCount > 0 ? 'true' : 'false';
    results.docWarningCount = docWarningCount;
    // Legacy: uploadDfcsMAction sends result='false' whenever $finalDuplicateCSVData is
    // non-empty at all (OsahformController.php:10786-10804) — not conditioned on
    // nofDocketNotCreated. That array mixes hard failures AND doc-missing warnings, same as
    // errorReport here, so a batch where every docket was created but some are missing
    // required documents must still come back as 'false' — otherwise the controller's
    // success branch never generates/returns the error-report CSV, and the doc warnings are
    // silently dropped instead of surfaced.
    results.result = results.errorReport.length === 0 ? 'true' : 'false';
    return results;
  }

  /**
   * Read CSV file and return header and data rows
   * DFCS uses a simpler CSV parsing without column count validation in parser
   * (validation is done after parsing in importDFCS method)
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
   * Build lookup cache for validation and master record deduplication
   * Pre-fetches all existing master records to avoid N+1 queries
   */
  async buildLookupCache() {
    const [counties, agencies, casetypes, caseworkerMasters, attorneyMasters] = await Promise.all([
      County.findAll({ attributes: ['countyId', 'countyDescription'] }),
      Agency.findAll({ attributes: ['agencyId', 'agencyCode'] }),
      // Legacy scopes casetype existence/routing to Agency 32 (DFCS) / 262 (DFCS-M), active
      // only (OsahformController.php:9007-9015, 9221-9224) — not the global casetypes table.
      Casetypes.findAll({
        attributes: ['caseTypeId', 'caseCode', 'agencyCode', 'agencyId'],
        where: {
          agencyId: { [Op.in]: [DFCS_CONSTANTS.AGENCY_ID_DFCS, DFCS_CONSTANTS.AGENCY_ID_DFCS_M] },
          isActive: '1',
        },
      }),
      // Pre-fetch all caseworker master records (Case Worker + Regional Coordinator)
      AgencyCaseworkerByCaseMaster.findAll({
        attributes: ['firstName', 'lastName', 'address1', 'typeOfContact'],
        where: {
          typeOfContact: {
            [Op.in]: [DFCS_CONSTANTS.PARTY_TYPE.CASE_WORKER, DFCS_CONSTANTS.PARTY_TYPE.REGIONAL_COORDINATOR],
          },
        },
        raw: true,
      }),
      // Pre-fetch all attorney master records (Petitioner Attorney)
      AttorneyByCaseMaster.findAll({
        attributes: ['firstName', 'lastName', 'address1', 'typeOfContact'],
        where: { typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.PETITIONER_ATTORNEY },
        raw: true,
      }),
    ]);

    // Build Sets for O(1) master record lookups using composite keys
    const caseworkerMasterSet = new Set(
      caseworkerMasters.map((m) => `${m.firstName}|${m.lastName}|${m.address1}|${m.typeOfContact}`)
    );
    const attorneyMasterSet = new Set(
      attorneyMasters.map((m) => `${m.firstName}|${m.lastName}|${m.address1}|${m.typeOfContact}`)
    );

    return {
      countyMap: new Map(counties.map((c) => [c.countyDescription?.toUpperCase(), c.countyId])),
      agencySet: new Set(agencies.map((a) => a.agencyCode?.toUpperCase())),
      // Existence validation: any active casetype on either DFCS agency (OsahformController.php:9221-9224).
      casetypeSet: new Set(casetypes.map((c) => c.caseCode?.toUpperCase())),
      // Routing: active casetypes on Agency 32 (DFCS) specifically (OsahformController.php:9007-9010) —
      // a row's casecode being in this set is what decides DFCS vs DFCS-M. String()-coerced:
      // despite the Casetypes model declaring agencyId as STRING(100), mysql2 returns it as a
      // JS number — a bare `===` here silently matched nothing and defaulted every row to DFCS-M.
      dfcsCaseTypeSet: new Set(
        casetypes.filter((c) => String(c.agencyId) === DFCS_CONSTANTS.AGENCY_ID_DFCS).map((c) => c.caseCode?.toUpperCase()),
      ),
      // Legacy: casetypes WHERE CaseCode = X AND Agencycode = Y -> Casetypeid
      // (OsahformController.php:9576-9592), used to feed the calendar hearing-assignment lookup.
      casetypeIdMap: new Map(
        casetypes.map((c) => [`${c.caseCode?.toUpperCase()}|${c.agencyCode?.toUpperCase()}`, c.caseTypeId]),
      ),
      caseworkerMasterSet,
      attorneyMasterSet,
      // Track masters created in-batch to avoid duplicates within same upload
      createdMasterKeys: new Set(),
    };
  }

  /**
   * Get existing open dockets for duplicate checking. Legacy's duplicate check matches on
   * agencyrefnumber + casetype + refagency together, not refno alone (OsahformController.php:9658-9659) —
   * two rows sharing a ref# but different casetypes are not duplicates.
   */
  async getExistingDockets() {
    const openDockets = await Docket.findAll({
      where: {
        refAgency: { [Op.in]: [DFCS_CONSTANTS.AGENCY_DFCS, DFCS_CONSTANTS.AGENCY_DFCS_M] },
        status: { [Op.ne]: DFCS_CONSTANTS.STATUS.CLOSED },
      },
      attributes: ['agencyRefNumber', 'caseType', 'refAgency'],
    });
    return new Set(openDockets.map((d) => buildDuplicateKey(d.agencyRefNumber, d.caseType, d.refAgency)));
  }

  /**
   * Process a single CSV row
   */
  async processRow(csvRow, headerRow, user, lookupCache, existingDocketSet, createdRefnos) {
    const rowData = mapDfcsCsvRowToData(csvRow, lookupCache.dfcsCaseTypeSet);

    // Validate row
    const validation = this.validateRow(rowData, lookupCache, existingDocketSet, createdRefnos);
    if (!validation.valid) {
      return { error: createErrorRecord(csvRow, headerRow, validation.message), errorType: validation.type };
    }

    // Create docket with parties
    const result = await this.createDocketWithParties(rowData, csvRow, headerRow, user, lookupCache);
    if (!result.success) return { error: result.error, errorType: 'creation' };

    createdRefnos.add(buildDuplicateKey(rowData.refno, rowData.casecode, rowData.agency));
    const docWarning = result.docsWarning ? createErrorRecord(csvRow, headerRow, result.docsWarning) : null;
    return { created: { caseId: result.caseId, refno: rowData.refno }, docWarning };
  }

  /**
   * Validate CSV row data
   */
  validateRow(rowData, lookupCache, existingDocketSet, createdRefnos) {
    // Validate mandatory fields (petitioner core fields + case worker core fields + dates).
    // Legacy treats a blank ref# as just another mandatory-field violation — reported in the
    // error CSV and counted in nofDocketNotCreated, not silently skipped (OsahformController.php:9236-9245).
    const missingFields = [];
    if (!rowData.refno) missingFields.push('Ref No');
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
      return { valid: false, type: 'missing', message: ERROR_MESSAGES.MANDATORY_FIELDS(missingFields) };
    }

    // Validate agency
    if (!lookupCache.agencySet.has(rowData.agency?.toUpperCase())) {
      return { valid: false, type: 'validation', message: `Agency not found: ${rowData.agency}` };
    }

    // Validate casetype
    if (!lookupCache.casetypeSet.has(rowData.casecode?.toUpperCase())) {
      return { valid: false, type: 'validation', message: `CaseType not found: ${rowData.casecode}` };
    }

    // Validate county
    if (!lookupCache.countyMap.has(rowData.county?.toUpperCase())) {
      return { valid: false, type: 'validation', message: `County not found: ${rowData.county}` };
    }

    // Validate date formats (MM-DD-YYYY or MM/DD/YYYY)
    const dateErrors = [];
    const dateReceivedValidation = validateHearingDateFormat(rowData.dateReceived);
    if (!dateReceivedValidation.valid) dateErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(`Date Received: ${dateReceivedValidation.error}`));
    const dateRequestedValidation = validateHearingDateFormat(rowData.dateRequested);
    if (!dateRequestedValidation.valid) dateErrors.push(ERROR_MESSAGES.INVALID_DATE_FORMAT(`Date Requested: ${dateRequestedValidation.error}`));
    if (dateErrors.length > 0) {
      return { valid: false, type: 'validation', message: dateErrors.join('; ') };
    }

    // Validate email formats (optional fields — only checked when provided). Legacy uses one
    // generic message for the row if any of the three is invalid, not a field-specific one
    // (OsahformController.php:9457-9528, uploadDfcsMAction).
    const emailValues = [rowData.petitionerEmail, rowData.petitionerAttorneyEmail, rowData.petitionerRepEmail];
    if (emailValues.some((value) => value && !isValidEmail(value))) {
      return { valid: false, type: 'validation', message: ERROR_MESSAGES.INVALID_EMAIL };
    }

    // Check duplicates — refno + casetype + agency together (OsahformController.php:9658-9659),
    // not refno alone.
    const duplicateKey = buildDuplicateKey(rowData.refno, rowData.casecode, rowData.agency);
    if (existingDocketSet.has(duplicateKey) || createdRefnos.has(duplicateKey)) {
      return { valid: false, type: 'duplicate', message: ERROR_MESSAGES.DUPLICATE(rowData.refno) };
    }

    return { valid: true };
  }

  /**
   * Create docket with all parties in a transaction
   */
  async createDocketWithParties(rowData, csvRow, headerRow, user, lookupCache) {
    const transaction = await mysqlSequelize.transaction();

    try {
      const dateReceived = parseHearingDate(rowData.dateReceived);
      const dateRequested = parseHearingDate(rowData.dateRequested);
      const countyId = lookupCache.countyMap.get(rowData.county?.toUpperCase()) || 'UNASSIGNED';
      const currentDatetime = new Date();

      // Legacy: casetypes WHERE CaseCode/Agencycode -> Casetypeid, then feeds the calendar
      // hearing-assignment lookup (OsahformController.php:9576-9643). A live per-row read —
      // not prefetched — since the slot capacity check counts already-committed dockets.
      const casetypeId = lookupCache.casetypeIdMap.get(
        `${rowData.casecode?.toUpperCase()}|${rowData.agency?.toUpperCase()}`,
      ) ?? '0';
      const hearingAssignment = await resolveHearingAssignment(casetypeId, countyId);

      // Create docket
      const newDocket = await this.createDocketRecord(rowData, {
        dateReceived, dateRequested, user, currentDatetime, hearingAssignment,
      }, transaction);

      // Update docket number: {AGENCY}-{CASETYPE}-{caseId}-{countyId}-{judgeLastName}
      // Legacy appends the assigned judge's last name (empty string if no slot was found),
      // leaving a trailing empty segment in that case — preserved exactly (OsahformController.php:9751).
      const docketNumber = `${rowData.agency}-${rowData.casecode}-${newDocket.caseId}-${countyId}-${hearingAssignment.judgeLastName || ''}`;
      await Docket.update({ docketNumber }, { where: { caseId: newDocket.caseId }, transaction });

      await this.createOpenCloseDetails(newDocket.caseId, user, currentDatetime, transaction);

      const caseName = await createPetitioner(newDocket.caseId, rowData, currentDatetime, transaction);
      if (caseName) {
        await Docket.update({ caseName }, { where: { caseId: newDocket.caseId }, transaction });
      }

      const attorneyName = await createPetitionerAttorney(newDocket.caseId, rowData, currentDatetime, transaction, lookupCache);
      if (attorneyName) {
        await Docket.update({ attorneyForPetitioner: attorneyName }, { where: { caseId: newDocket.caseId }, transaction });
      }

      await createRepresentative(newDocket.caseId, rowData, currentDatetime, transaction);

      const stateRep = await createCaseWorker(newDocket.caseId, rowData, currentDatetime, transaction, lookupCache);
      if (stateRep) {
        await Docket.update({ stateRepresentative: stateRep }, { where: { caseId: newDocket.caseId }, transaction });
      }

      await createRegionalCoordinator(newDocket.caseId, rowData, currentDatetime, transaction, lookupCache);

      await transaction.commit();

      // Non-fatal — the docket + parties already committed successfully regardless of
      // whether any DHS document is found/attached. Legacy: uploadDfcsMAction's S3 lookup.
      // docsWarning never blocks docket creation — it's only reported in the error CSV,
      // matching legacy (OsahformController.php:10069-10210).
      let docsWarning = null;
      try {
        const attachResult = await attachDhsDocumentsToDocket(
          newDocket.caseId, rowData.refno, rowData.casecode, dateRequested, user?.user_id ?? user?.id ?? user?.userId ?? 0,
        );
        docsWarning = buildMissingDocsMessage(attachResult);
      } catch (error) {
        logger.error('DHS document attachment failed:', { caseId: newDocket.caseId, error: error.message });
        docsWarning = buildMissingDocsMessage({ attachedCount: 0, foundDocTypes: new Set() });
      }

      return { success: true, caseId: newDocket.caseId, docsWarning };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating DFCS docket:', { error: error.message });
      return { success: false, error: createErrorRecord(csvRow, headerRow, ERROR_MESSAGES.DOCKET_FAILED(error.message)) };
    }
  }

  /**
   * Create the main docket record
   */
  async createDocketRecord(rowData, { dateReceived, dateRequested, user, currentDatetime, hearingAssignment }, transaction) {
    return Docket.create({
      refAgency: rowData.agency,
      caseType: rowData.casecode,
      county: rowData.county,
      dateRequested: dateRequested || currentDatetime,
      agencyRefNumber: rowData.refno,
      hearingMode: DFCS_CONSTANTS.HEARING_MODE, // 'In Person' per legacy code (calendar query never selects it)
      dateReceivedByOSAH: dateReceived || currentDatetime,
      docketClerk: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined,
      telvOFive: '1',
      hearingSite: hearingAssignment.hearingSite,
      hearingDate: hearingAssignment.hearingDate,
      hearingTime: hearingAssignment.hearingTime,
      judge: hearingAssignment.judge,
      judgeAssistant: hearingAssignment.judgeAssistant,
      status: hearingAssignment.status, // 'Hearing Scheduled' or 'Pending', from the calendar lookup
      docketCreatedDate: currentDatetime,
    }, { transaction });
  }

  // Note: createOpenCloseDetails inherited from BaseBulkUploadService.
  // Party creation (petitioner, attorney, representative, case worker, regional
  // coordinator) is delegated to dfcsPartyFactory.
}

export default new DfcsBulkUploadService();

