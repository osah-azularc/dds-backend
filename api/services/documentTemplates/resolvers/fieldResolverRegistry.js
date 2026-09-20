/**
 * fieldResolverRegistry.js
 *
 * Declarative mapping from DB field_key column values to resolver functions.
 * Keys are snake_case to mirror the database field_key column exactly.
 * Values are references to pure resolver functions from coreResolvers.js.
 *
 * The resolver engine is solely responsible for error handling and fallbacks.
 */

import {
  resolvePetitionerName,
  resolveRespondentName,
  resolveCaseId,
  resolveDocketNumber,
  resolveDateRequested,
  resolveHearingDate,
  resolveHearingTime,
  resolveHearingOfficerName,
  resolveJudgeName,
  resolveCurrentDate,
  resolveCurrentDayWithSuffix,
  resolveCurrentMonthYear,
  resolveAgencyRefNumber,
  resolveUniqueAccessCode,
  resolveHearingSiteName,
  resolveHearingSiteAddress,
  resolveHearingSiteCityStateZip,
  resolveCmaFirstName,
  resolveCmaLastName,
  resolveCmaPhone,
  resolveCmaFax,
  resolveCmaEmail,
  resolveMailingList,
  resolveSelectedPartyAddress1,
  resolveSelectedPartyAddress2,
  resolveSelectedPartyAddress3,
  resolveSelectedPartyAddress4,
  resolveSelectedPartyAddress5,
  resolveSelectedPartyAddress6,
} from './coreResolvers.js';

/**
 * Maps each DB field_key to its resolver function.
 * Add new entries here when new merge field types are introduced.
 * @type {Record<string, (context: object) => string>}
 */
export const resolverRegistry = {
  petitioner_name:            resolvePetitionerName,
  respondent_name:            resolveRespondentName,
  case_id:                    resolveCaseId,
  docket_number:              resolveDocketNumber,
  date_requested:             resolveDateRequested,
  hearing_date:               resolveHearingDate,
  hearing_time:               resolveHearingTime,
  hearing_officer_name:       resolveHearingOfficerName,
  judge_name:                 resolveJudgeName,
  current_date:               resolveCurrentDate,
  current_day_with_suffix:    resolveCurrentDayWithSuffix,
  current_month_year:         resolveCurrentMonthYear,
  agency_reference_number:    resolveAgencyRefNumber,
  unique_access_code:         resolveUniqueAccessCode,
  hearing_site_name:          resolveHearingSiteName,
  hearing_site_address:       resolveHearingSiteAddress,
  hearing_site_city_state_zip: resolveHearingSiteCityStateZip,
  cma_first_name:             resolveCmaFirstName,
  cma_last_name:              resolveCmaLastName,
  cma_phone:                  resolveCmaPhone,
  cma_fax:                    resolveCmaFax,
  cma_fax_alt:                resolveCmaFax,
  cma_email:                  resolveCmaEmail,
  mailing_list:               resolveMailingList,
  selected_party_address_1:   resolveSelectedPartyAddress1,
  selected_party_address_2:   resolveSelectedPartyAddress2,
  selected_party_address_3:   resolveSelectedPartyAddress3,
  selected_party_address_4:   resolveSelectedPartyAddress4,
  selected_party_address_5:   resolveSelectedPartyAddress5,
  selected_party_address_6:   resolveSelectedPartyAddress6,
};
