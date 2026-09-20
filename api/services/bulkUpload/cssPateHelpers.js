import { trimUniCodeChar, capitalizeFirst, parseCounty } from './bulkUploadCommonHelpers.js';

/**
 * CSS PAT-E Bulk Upload Helpers
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Per-agency constants and CSV row mapper for CSS Paternity Establishment (PAT-E) imports.
 */

export const CSS_PATE_CONSTANTS = {
  AGENCY: 'CSS',
  CASE_TYPE: 'PAT-E',
  AGENCY_ID: '7',
  CASETYPE_ID: '978',
  REQUIRED_COLUMNS: 39,
  PARTY_TYPE: {
    CUSTODIAL_PARENT: 'Custodial Parent',
    RESPONDENT: 'Respondent',
  },
  STATUS: {
    HEARING_SCHEDULED: 'Hearing Scheduled',
    CLOSED: 'Closed',
  },
  HEARING_MODE: 'Hearing',
  MAX_MINORS: 6,
  // NOH Automation is disabled for PAT-E per legacy code comment:
  // "U6882: eCourt: bulk upload feature for CSS-PAT-E cases - UPDATE"
  NOH_AUTOMATION_ENABLED: false,
};

/**
 * Map CSV row array to structured data object for PAT-E (39 columns)
 * Column mapping based on legacy BulkuploadController::uploadcsspeteAction
 */
export function mapPateCsvRowToData(csvRow) {
  return {
    agency: CSS_PATE_CONSTANTS.AGENCY,
    casecode: CSS_PATE_CONSTANTS.CASE_TYPE,
    refno: trimUniCodeChar(csvRow[0]),
    // Custodial Parent (columns 1-6)
    cpLastName: trimUniCodeChar(csvRow[1]),
    cpFirstName: trimUniCodeChar(csvRow[2]),
    cpAddress1: trimUniCodeChar(csvRow[3]),
    cpCity: trimUniCodeChar(csvRow[4]),
    cpState: trimUniCodeChar(csvRow[5]),
    cpZip: trimUniCodeChar(csvRow[6]),
    // Respondent (columns 7-12)
    custodialLastName: trimUniCodeChar(csvRow[7]),
    custodialFirstName: trimUniCodeChar(csvRow[8]),
    custodialAddress1: trimUniCodeChar(csvRow[9]),
    custodialCity: trimUniCodeChar(csvRow[10]),
    custodialState: trimUniCodeChar(csvRow[11]),
    custodialZip: trimUniCodeChar(csvRow[12]),
    // Minors (columns 13-30)
    minorLastName1: trimUniCodeChar(csvRow[13]),
    minorFirstName1: trimUniCodeChar(csvRow[14]),
    minorYear1: trimUniCodeChar(csvRow[15]),
    minorLastName2: trimUniCodeChar(csvRow[16]),
    minorFirstName2: trimUniCodeChar(csvRow[17]),
    minorYear2: trimUniCodeChar(csvRow[18]),
    minorLastName3: trimUniCodeChar(csvRow[19]),
    minorFirstName3: trimUniCodeChar(csvRow[20]),
    minorYear3: trimUniCodeChar(csvRow[21]),
    minorLastName4: trimUniCodeChar(csvRow[22]),
    minorFirstName4: trimUniCodeChar(csvRow[23]),
    minorYear4: trimUniCodeChar(csvRow[24]),
    minorLastName5: trimUniCodeChar(csvRow[25]),
    minorFirstName5: trimUniCodeChar(csvRow[26]),
    minorYear5: trimUniCodeChar(csvRow[27]),
    minorLastName6: trimUniCodeChar(csvRow[28]),
    minorFirstName6: trimUniCodeChar(csvRow[29]),
    minorYear6: trimUniCodeChar(csvRow[30]),
    // Hearing Info (columns 31-38)
    hearingDate: trimUniCodeChar(csvRow[31]),
    hearingTime: trimUniCodeChar(csvRow[32]),
    county: parseCounty(csvRow[33]),
    hearingLocation: trimUniCodeChar(csvRow[34]),
    judgeFirstName: capitalizeFirst(trimUniCodeChar(csvRow[35])),
    judgeLastName: capitalizeFirst(trimUniCodeChar(csvRow[36])),
    judgeName: `${capitalizeFirst(trimUniCodeChar(csvRow[36]))} ${capitalizeFirst(trimUniCodeChar(csvRow[35]))}`,
    assistantFirstName: capitalizeFirst(trimUniCodeChar(csvRow[37])),
    assistantLastName: capitalizeFirst(trimUniCodeChar(csvRow[38])),
    assistantName: `${capitalizeFirst(trimUniCodeChar(csvRow[38]))} ${capitalizeFirst(trimUniCodeChar(csvRow[37]))}`,
  };
}

