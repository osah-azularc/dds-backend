import { mysqlSequelize } from "../../../connections/seqDB.js";
import { ValidationError } from "../validators.js";

const buildConfig = (restrictionType) => (restrictionType === 'hearing'
  ? {
      calcFromField: 'noHearingCalcFrom',
      daysField: 'noHearing',
      typeField: 'noHearingType',
      validCalcFrom: ['datereceivedbyOSAH', 'daterequested'],
      restrictionName: 'noHearingCalcFrom',
    }
  : {
      calcFromField: 'noDecisionCalcFrom',
      daysField: 'noDecision',
      typeField: 'noDecisionType',
      validCalcFrom: ['datereceivedbyOSAH', 'daterequested', 'hearingdate'],
      restrictionName: 'noDecisionCalcFrom',
    });

const validateCalcFromOrThrow = (calcFrom, config) => {
  if (calcFrom && !config.validCalcFrom.includes(calcFrom)) {
    throw new ValidationError(
      `Invalid ${config.restrictionName} value: ${calcFrom}. Expected one of: ${config.validCalcFrom.join(
        ', ',
      )}`,
      config.restrictionName,
    );
  }
};

const buildAgencyCondition = (agency) => (agency ? `refagency=${mysqlSequelize.escape(agency)} AND ` : '');

const addCalendarRestriction = (
  casetypeRestrictionArray,
  casetypeRestrictionDefaultArray,
  calcFrom,
  days,
  agency,
  casetype,
) => {
  const agencyCondition = buildAgencyCondition(agency);
  casetypeRestrictionArray.push(
    `(${calcFrom} < DATE_ADD(CURRENT_DATE, INTERVAL -${days} DAY) AND ${agencyCondition}casetype=${mysqlSequelize.escape(
      casetype,
    )})`,
  );
  casetypeRestrictionDefaultArray.push(
    `(${agencyCondition}casetype=${mysqlSequelize.escape(casetype)})`,
  );
};

const buildHolidaysArray = (calcFrom, holidaysData) => {
  const holidaysArray = [];

  for (const holidayData of holidaysData) {
    const month = String(holidayData.month).padStart(2, '0');
    const dateDay = String(holidayData.dateDay).padStart(2, '0');

    if (holidayData.type === 'date') {
      holidaysArray.push(
        `(IF(((CONCAT(YEAR(${calcFrom}),"-${month}-${dateDay}") BETWEEN ${calcFrom} AND CURRENT_DATE) AND (DAYOFWEEK(CONCAT(YEAR(${calcFrom}),"-${month}-${dateDay}")) NOT IN (1,7))),1,0))`,
      );
    } else if (holidayData.type === 'day' && holidayData.week && holidayData.week !== -1) {
      const week = Number.parseInt(holidayData.week, 10);
      const day = Number.parseInt(holidayData.dateDay, 10);
      holidaysArray.push(
        `(IF((DATE_SUB(DATE_ADD(DATE_SUB(CONCAT(YEAR(${calcFrom}),"-${month}-01"), INTERVAL DAYOFMONTH(CONCAT(YEAR(${calcFrom}),"-${month}-01")) - 1 DAY), INTERVAL ${week} WEEK), INTERVAL (7 - ((${day} - ((DAYOFWEEK(DATE_SUB(CONCAT(YEAR(${calcFrom}),"-${month}-01"), INTERVAL DAYOFMONTH(CONCAT(YEAR(${calcFrom}),"-${month}-01")) - 1 DAY)) - 2) % 7) + 7) % 7)) DAY)) BETWEEN ${calcFrom} AND CURRENT_DATE,1,0))`,
      );
    } else if (holidayData.type === 'day' && holidayData.week === -1) {
      holidaysArray.push(
        `(IF(DATE_FORMAT(LAST_DAY(CONCAT(YEAR(${calcFrom}),"-${month}-01")) - ((7 + WEEKDAY(LAST_DAY(CONCAT(YEAR(${calcFrom}),"-${month}-01"))) - 7) % 7), "%Y-%m-%d") BETWEEN ${calcFrom} AND CURRENT_DATE,1,0))`,
      );
    }
  }

  return holidaysArray;
};

const addBusinessRestriction = (
  casetypeRestrictionArray,
  casetypeRestrictionDefaultArray,
  calcFrom,
  days,
  agency,
  casetype,
  holidaysData,
) => {
  const holidaysArray = buildHolidaysArray(calcFrom, holidaysData);
  const holidaysSubtraction = holidaysArray.length ? `-${holidaysArray.join('-')}` : '';
  const agencyCondition = buildAgencyCondition(agency);

  casetypeRestrictionArray.push(
    `(((5 * (DATEDIFF(CURRENT_DATE, ${calcFrom}) DIV 7) + MID("0123444401233334012222340111123400012345001234550", 7 * WEEKDAY(${calcFrom}) + WEEKDAY(CURRENT_DATE) + 1, 1))${holidaysSubtraction}) > ${days} AND ${agencyCondition}casetype=${mysqlSequelize.escape(
      casetype,
    )})`,
  );
  casetypeRestrictionDefaultArray.push(
    `(${agencyCondition}casetype=${mysqlSequelize.escape(casetype)})`,
  );
};

const addDayOfMonthRestriction = (
  casetypeRestrictionArray,
  casetypeRestrictionDefaultArray,
  calcFrom,
  days,
  agency,
  casetype,
) => {
  const agencyCondition = buildAgencyCondition(agency);
  casetypeRestrictionArray.push(
    `(((CURRENT_DATE > CONCAT(YEAR(${calcFrom}),"-",LPAD(MONTH(${calcFrom}), 2, "0"),"-",LPAD(${days}, 2, "0")) AND DAY(${calcFrom}) < ${days}) OR (CURRENT_DATE > (CONCAT(YEAR(${calcFrom}),"-",LPAD(MONTH(${calcFrom}), 2, "0"),"-",LPAD(${days}, 2, "0")) + INTERVAL 1 MONTH) AND DAY(${calcFrom}) > ${days})) AND ${agencyCondition}casetype=${mysqlSequelize.escape(
      casetype,
    )})`,
  );
  casetypeRestrictionDefaultArray.push(
    `(${agencyCondition}casetype=${mysqlSequelize.escape(casetype)})`,
  );
};

const buildDefaultRestriction = (calcFrom, days) => `(${calcFrom} < DATE_ADD(CURRENT_DATE, INTERVAL -${days} DAY))`;

/**
 * Build casetype restriction conditions for aging reports
 * Helper function to eliminate code duplication between no-hearing-date and no-decision reports
 *
 * @param {Array} casetypeRestrictionData - Array of casetype restriction records
 * @param {Array} holidaysData - Array of holiday records for business days calculation
 * @param {string} restrictionType - Type of restriction: 'hearing' or 'decision'
 * @returns {Object} Object containing casetypeRestrictionArray and casetypeRestrictionDefault
 */
export function buildCasetypeRestrictionConditions(casetypeRestrictionData, holidaysData, restrictionType) {
  const casetypeRestrictionArray = [];
  const casetypeRestrictionDefaultArray = [];
  let casetypeRestrictionDefault = '';

  // Define field mappings and validation whitelists based on restriction type
  const config = buildConfig(restrictionType);

  for (const data of casetypeRestrictionData) {
    const calcFrom = data[config.calcFromField];

    // Validate calcFrom against whitelist to prevent SQL injection
    validateCalcFromOrThrow(calcFrom, config);

    const days = Number.parseInt(data[config.daysField], 10);
    const calcType = data[config.typeField];
    const agency = data.agency;
    const casetype = data.caseType;

    // Calendar days calculation
    if (calcType === 'calendar' && days && casetype !== 'default') {
      addCalendarRestriction(
        casetypeRestrictionArray,
        casetypeRestrictionDefaultArray,
        calcFrom,
        days,
        agency,
        casetype,
      );
    }
    // Business days calculation
    else if (calcType === 'bussiness' && days && casetype !== 'default') {
      addBusinessRestriction(
        casetypeRestrictionArray,
        casetypeRestrictionDefaultArray,
        calcFrom,
        days,
        agency,
        casetype,
        holidaysData,
      );
    }
    // Day of month calculation (only for no-decision)
    else if (calcType === 'dayOFMonth' && days && casetype !== 'default') {
      addDayOfMonthRestriction(
        casetypeRestrictionArray,
        casetypeRestrictionDefaultArray,
        calcFrom,
        days,
        agency,
        casetype,
      );
    }
    // Default case
    else if (casetype === 'default') {
      casetypeRestrictionDefault = buildDefaultRestriction(calcFrom, days);
    }
  }

  // Add default condition with exclusions
  if (casetypeRestrictionDefault) {
    const exclusions = casetypeRestrictionDefaultArray.length
      ? ` AND !(${casetypeRestrictionDefaultArray.join(' OR ')})`
      : '';
    casetypeRestrictionArray.push(`(${casetypeRestrictionDefault}${exclusions})`);
  }

  return {
    casetypeRestrictionArray,
    casetypeRestrictionDefault
  };
}

