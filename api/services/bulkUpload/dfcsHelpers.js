import { trimUniCodeChar, parseCounty } from './bulkUploadCommonHelpers.js';

/**
 * DFCS Bulk Upload Helpers
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Per-agency constants and CSV row mapper for DFCS / DFCS-M imports.
 */

export const DFCS_CONSTANTS = {
  // Dynamic agency based on case type (FSP/TANF → DFCS, others → DFCS-M)
  AGENCY_DFCS: 'DFCS',
  AGENCY_DFCS_M: 'DFCS-M',
  AGENCY_ID_DFCS: '32',
  AGENCY_ID_DFCS_M: '262',
  REQUIRED_COLUMNS: 45,
  PARTY_TYPE: {
    PETITIONER: 'Petitioner',
    PETITIONER_ATTORNEY: 'Petitioner Attorney',
    REPRESENTATIVE: 'Representative',
    CASE_WORKER: 'Case Worker',
    REGIONAL_COORDINATOR: 'Regional Hearing Coordinator',
  },
  STATUS: {
    HEARING_SCHEDULED: 'Hearing Scheduled',
    PENDING: 'Pending',
    CLOSED: 'Closed',
  },
  // Default hearing mode per legacy PHP code (line 9604)
  HEARING_MODE: 'In Person',
  // NOH Automation is commented out in PHP legacy code (OsahformController lines 10742-10772)
  NOH_AUTOMATION_ENABLED: false,
};

/**
 * Map CSV row array to structured data object for DFCS (45 columns)
 * Column mapping based on legacy OsahformController::uploadDfcsMAction
 *
 * CSV Structure:
 * 0: casecode, 1: county, 2: date_received, 3: date_requested, 4: refno
 * 5-12: petitioner (LN, FN, Add1, Add2, City, State, Zip, Email)
 * 13-20: petitioner_attorney (LN, FN, Add1, Add2, City, State, Zip, Email)
 * 21-28: petitioner_rep (LN, FN, Add1, Add2, City, State, Zip, Email)
 * 29-35: case_worker (LN, FN, Add1, Add2, City, State, Zip)
 * 36-42: regional_coordinator (LN, FN, Add1, Add2, City, State, Zip)
 * 43: reasonable_modification, 44: language
 */
export function mapDfcsCsvRowToData(csvRow, dfcsCaseTypeSet) {
  const casecode = trimUniCodeChar(csvRow[0])?.toUpperCase() || '';
  // Legacy: casetypes WHERE AgencyID = 32 AND is_active = '1' (OsahformController.php:9007-9010,
  // 9049-9052) — DB-driven routing, not a hardcoded casecode list. dfcsCaseTypeSet is fetched
  // once per import in buildLookupCache() and passed in here.
  const isDfcsAgency = dfcsCaseTypeSet?.has(casecode) ?? false;
  const agency = isDfcsAgency ? DFCS_CONSTANTS.AGENCY_DFCS : DFCS_CONSTANTS.AGENCY_DFCS_M;

  return {
    agency,
    casecode,
    county: parseCounty(csvRow[1]),
    dateReceived: trimUniCodeChar(csvRow[2]),
    dateReceivedCsvFormat: trimUniCodeChar(csvRow[2]),
    dateRequested: trimUniCodeChar(csvRow[3]),
    dateRequestedCsvFormat: trimUniCodeChar(csvRow[3]),
    refno: trimUniCodeChar(csvRow[4]),
    // Petitioner (columns 5-12)
    petitionerLastName: trimUniCodeChar(csvRow[5]),
    petitionerFirstName: trimUniCodeChar(csvRow[6]),
    petitionerAddress1: trimUniCodeChar(csvRow[7]),
    petitionerAddress2: trimUniCodeChar(csvRow[8]),
    petitionerCity: trimUniCodeChar(csvRow[9]),
    petitionerState: trimUniCodeChar(csvRow[10]),
    petitionerZip: trimUniCodeChar(csvRow[11]),
    petitionerEmail: trimUniCodeChar(csvRow[12]),
    // Petitioner Attorney (columns 13-20)
    petitionerAttorneyLastName: trimUniCodeChar(csvRow[13]),
    petitionerAttorneyFirstName: trimUniCodeChar(csvRow[14]),
    petitionerAttorneyAddress1: trimUniCodeChar(csvRow[15]),
    petitionerAttorneyAddress2: trimUniCodeChar(csvRow[16]),
    petitionerAttorneyCity: trimUniCodeChar(csvRow[17]),
    petitionerAttorneyState: trimUniCodeChar(csvRow[18]),
    petitionerAttorneyZip: trimUniCodeChar(csvRow[19]),
    petitionerAttorneyEmail: trimUniCodeChar(csvRow[20]),
    // Petitioner Representative (columns 21-28)
    petitionerRepLastName: trimUniCodeChar(csvRow[21]),
    petitionerRepFirstName: trimUniCodeChar(csvRow[22]),
    petitionerRepAddress1: trimUniCodeChar(csvRow[23]),
    petitionerRepAddress2: trimUniCodeChar(csvRow[24]),
    petitionerRepCity: trimUniCodeChar(csvRow[25]),
    petitionerRepState: trimUniCodeChar(csvRow[26]),
    petitionerRepZip: trimUniCodeChar(csvRow[27]),
    petitionerRepEmail: trimUniCodeChar(csvRow[28]),
    // Case Worker (columns 29-35)
    caseWorkerLastName: trimUniCodeChar(csvRow[29]),
    caseWorkerFirstName: trimUniCodeChar(csvRow[30]),
    caseWorkerAddress1: trimUniCodeChar(csvRow[31]),
    caseWorkerAddress2: trimUniCodeChar(csvRow[32]),
    caseWorkerCity: trimUniCodeChar(csvRow[33]),
    caseWorkerState: trimUniCodeChar(csvRow[34]),
    caseWorkerZip: trimUniCodeChar(csvRow[35]),
    // Regional Coordinator (columns 36-42)
    regionalCoordinatorLastName: trimUniCodeChar(csvRow[36]),
    regionalCoordinatorFirstName: trimUniCodeChar(csvRow[37]),
    regionalCoordinatorAddress1: trimUniCodeChar(csvRow[38]),
    regionalCoordinatorAddress2: trimUniCodeChar(csvRow[39]),
    regionalCoordinatorCity: trimUniCodeChar(csvRow[40]),
    regionalCoordinatorState: trimUniCodeChar(csvRow[41]),
    regionalCoordinatorZip: trimUniCodeChar(csvRow[42]),
    // Special fields (columns 43-44)
    reasonableModification: trimUniCodeChar(csvRow[43]),
    language: trimUniCodeChar(csvRow[44]),
  };
}

/**
 * Legacy: OsahformController.php:10069-10210 — after the S3 document lookup for a row,
 * report (but don't block on) missing documents. Two cases, merged into the same error-report
 * CSV as every other validation error:
 *  - no S3 folder/documents matched at all for the ref#/case-type combination
 *  - some documents matched, but the "Adverse Action Letter" and/or "Hearing Request" type
 *    specifically wasn't among them (OSAH Form1 / Other Documents presence isn't checked)
 * Returns null when nothing is missing (both required types were found).
 */
export function buildMissingDocsMessage({ attachedCount, foundDocTypes }) {
  if (attachedCount === 0) {
    return 'Some Documents Folders were not found on S3 bucket for given Agency Ref Number and Case Type Combination';
  }

  const missingAdverseAction = !foundDocTypes.has('Adverse Action Letter');
  const missingHearingRequest = !foundDocTypes.has('Hearing Request');
  if (!missingAdverseAction && !missingHearingRequest) return null;

  // Legacy builds this by string concatenation with a quirk preserved here: the Hearing
  // Request label already ends in "Document", so the lone-hearing-missing case reads
  // "Hearing Request Document Document" — kept verbatim for exact parity.
  const adverseActionLabel = missingAdverseAction ? 'Adverse Action Letter' : '';
  const hearingRequestLabel = missingHearingRequest ? 'Hearing Request Document' : '';
  const missingLabel = missingAdverseAction && missingHearingRequest
    ? `${adverseActionLabel},${hearingRequestLabel} Documents`
    : `${adverseActionLabel}${hearingRequestLabel} Document`;

  return `${missingLabel} were not found on S3 bucket for given Agency Ref Number and Case Type Combination`;
}

