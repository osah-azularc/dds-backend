import { trimUniCodeChar, capitalizeFirst } from './bulkUploadCommonHelpers.js';

/**
 * CSS EST Bulk Upload Helpers
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Per-agency constants and CSV row mapper for CSS Establishment (EST) imports.
 */

export const CSS_CONSTANTS = {
  AGENCY: 'CSS',
  CASE_TYPE: 'EST',
  AGENCY_ID: '7',
  CASETYPE_ID: '606',
  REQUIRED_COLUMNS: 33,
  NOH_AUTOMATION_SUB_TYPE: 'In Person Hearing',
  PARTY_TYPE: {
    RESPONDENT: 'Respondent',
    PETITIONER: 'Petitioner',
  },
  STATUS: {
    HEARING_SCHEDULED: 'Hearing Scheduled',
    CLOSED: 'Closed',
  },
  HEARING_MODE: 'Hearing',
  MAX_MINORS: 6,
};

/**
 * Map CSV row array to structured data object (all 33 columns)
 */
export function mapCsvRowToData(csvRow) {
  return {
    agency: CSS_CONSTANTS.AGENCY,
    casecode: CSS_CONSTANTS.CASE_TYPE,
    refno: trimUniCodeChar(csvRow[0]),
    custodialLastName: trimUniCodeChar(csvRow[1]),
    custodialFirstName: trimUniCodeChar(csvRow[2]),
    custodialAddress1: trimUniCodeChar(csvRow[3]),
    custodialCity: trimUniCodeChar(csvRow[4]),
    custodialState: trimUniCodeChar(csvRow[5]),
    custodialZip: trimUniCodeChar(csvRow[6]),
    minorLastName1: trimUniCodeChar(csvRow[7]),
    minorFirstName1: trimUniCodeChar(csvRow[8]),
    minorYear1: trimUniCodeChar(csvRow[9]),
    minorLastName2: trimUniCodeChar(csvRow[10]),
    minorFirstName2: trimUniCodeChar(csvRow[11]),
    minorYear2: trimUniCodeChar(csvRow[12]),
    minorLastName3: trimUniCodeChar(csvRow[13]),
    minorFirstName3: trimUniCodeChar(csvRow[14]),
    minorYear3: trimUniCodeChar(csvRow[15]),
    minorLastName4: trimUniCodeChar(csvRow[16]),
    minorFirstName4: trimUniCodeChar(csvRow[17]),
    minorYear4: trimUniCodeChar(csvRow[18]),
    minorLastName5: trimUniCodeChar(csvRow[19]),
    minorFirstName5: trimUniCodeChar(csvRow[20]),
    minorYear5: trimUniCodeChar(csvRow[21]),
    minorLastName6: trimUniCodeChar(csvRow[22]),
    minorFirstName6: trimUniCodeChar(csvRow[23]),
    minorYear6: trimUniCodeChar(csvRow[24]),
    hearingLocation: trimUniCodeChar(csvRow[28]),
    judgeLastName: capitalizeFirst(trimUniCodeChar(csvRow[30])),
    judgeFirstName: capitalizeFirst(trimUniCodeChar(csvRow[29])),
    judgeName: `${capitalizeFirst(trimUniCodeChar(csvRow[30]))} ${capitalizeFirst(trimUniCodeChar(csvRow[29]))}`,
    assistantLastName: capitalizeFirst(trimUniCodeChar(csvRow[31])),
    assistantFirstName: capitalizeFirst(trimUniCodeChar(csvRow[32])),
    assistantName: `${capitalizeFirst(trimUniCodeChar(csvRow[32]))} ${capitalizeFirst(trimUniCodeChar(csvRow[31]))}`,
    hearingDate: trimUniCodeChar(csvRow[25]),
    hearingTime: trimUniCodeChar(csvRow[26]),
  };
}

