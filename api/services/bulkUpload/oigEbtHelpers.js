import { trimUniCodeChar, capitalizeFirst, parseCounty } from './bulkUploadCommonHelpers.js';

/**
 * OIG EBT Bulk Upload Helpers
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Per-agency constants and CSV row mapper for OIG (Office of Inspector General)
 * EBTFSF imports.
 */

export const OIG_EBT_CONSTANTS = {
  AGENCY: 'OIG',
  CASE_TYPE: 'EBTFSF',
  AGENCY_ID: '237',
  CASETYPE_ID: '823',
  REQUIRED_COLUMNS: 27,
  PARTY_TYPE: {
    RESPONDENT: 'Respondent',
    INVESTIGATOR: 'Investigator',
  },
  STATUS: {
    HEARING_SCHEDULED: 'Hearing Scheduled',
    CLOSED: 'Closed',
  },
  HEARING_MODE: 'In Person',
  NOH_AUTOMATION_SUB_TYPE: 'In Person Hearing',
};

/**
 * Map CSV row array to structured data object for OIG EBT (27 columns)
 * Column mapping based on legacy OsahformController::uploadcasesAction
 *
 * CSV Structure:
 * 0: agency, 1: casecode, 2: county, 3: date_requested, 4: refno, 5: date_received
 * 6: hearing_location, 7: hearing_date, 8: hearing_time, 9: judge_FN, 10: judge_LN
 * 11: asst_FN, 12: asst_LN, 13: docket_clerk
 * 14-20: respondent (FN, LN, add1, add2, city, state, zip)
 * 21-26: investigator (FN, LN, add1, city, state, zip)
 */
export function mapOigEbtCsvRowToData(csvRow) {
  return {
    agency: trimUniCodeChar(csvRow[0])?.toUpperCase() || OIG_EBT_CONSTANTS.AGENCY,
    casecode: trimUniCodeChar(csvRow[1])?.toUpperCase() || OIG_EBT_CONSTANTS.CASE_TYPE,
    county: parseCounty(csvRow[2]),
    dateRequested: trimUniCodeChar(csvRow[3]),
    refno: trimUniCodeChar(csvRow[4]),
    dateReceived: trimUniCodeChar(csvRow[5]),
    hearingLocation: trimUniCodeChar(csvRow[6]),
    hearingDate: trimUniCodeChar(csvRow[7]),
    hearingTime: trimUniCodeChar(csvRow[8]),
    judgeFirstName: capitalizeFirst(trimUniCodeChar(csvRow[9])),
    judgeLastName: capitalizeFirst(trimUniCodeChar(csvRow[10])),
    judgeName: `${capitalizeFirst(trimUniCodeChar(csvRow[10]))} ${capitalizeFirst(trimUniCodeChar(csvRow[9]))}`,
    assistantFirstName: capitalizeFirst(trimUniCodeChar(csvRow[11])),
    assistantLastName: capitalizeFirst(trimUniCodeChar(csvRow[12])),
    assistantName: `${capitalizeFirst(trimUniCodeChar(csvRow[12]))} ${capitalizeFirst(trimUniCodeChar(csvRow[11]))}`,
    docketClerk: trimUniCodeChar(csvRow[13]),
    // Respondent (columns 14-20)
    respondentFirstName: trimUniCodeChar(csvRow[14]),
    respondentLastName: trimUniCodeChar(csvRow[15]),
    respondentAddress1: trimUniCodeChar(csvRow[16]),
    respondentAddress2: trimUniCodeChar(csvRow[17]),
    respondentCity: trimUniCodeChar(csvRow[18]),
    respondentState: trimUniCodeChar(csvRow[19]),
    respondentZip: trimUniCodeChar(csvRow[20]),
    // Investigator (columns 21-26)
    investigatorFirstName: trimUniCodeChar(csvRow[21]),
    investigatorLastName: trimUniCodeChar(csvRow[22]),
    investigatorAddress1: trimUniCodeChar(csvRow[23]),
    investigatorCity: trimUniCodeChar(csvRow[24]),
    investigatorState: trimUniCodeChar(csvRow[25]),
    investigatorZip: trimUniCodeChar(csvRow[26]),
  };
}

