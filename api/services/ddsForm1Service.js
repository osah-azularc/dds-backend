import Form1Docket from '../models/Form1Docket.js';
import Form1DdsPermitEligibilityEffectivedate from '../models/Form1DdsPermitEligibilityEffectivedate.js';
import Form1Dds1205Offence from '../models/Form1Dds1205Offence.js';

// DDS's fixed agency platform id (matches DdsForm1Controller::adddocketAction()'s
// hardcoded agency_platform_id => 5).
const DDS_AGENCY_PLATFORM_ID = 5;

const toNullIfZeroDate = (value) => (!value || value === '0000-00-00' ? null : value);

/**
 * Creates a new DDS Form 1 submission.
 * Ports DdsForm1Controller::adddocketAction() — writes to three tables:
 *  - form1_docket: the docket itself.
 *  - form1_dds_permit_eligibility_effectivedate: temporary permit
 *    eligibility, written for every docket regardless of eligibility.
 *  - form1_dds_1205_offence: 1205 offence shell row, extended with
 *    DOB/incident date only when the permit is eligible.
 * Judge/CMA/hearing site are intentionally left unset here — OSAH staff
 * assign those later, not the agency at submission time.
 */
export const addDocket = async (docketDetails, userId) => {
  const {
    refagency,
    casetype,
    county,
    daterequested,
    agencyrefnumber,
    hearingmode,
    eligiblepermit,
    permiteffectivedate,
    expiryDate,
    DOB,
    incident_date: incidentDate,
  } = docketDetails;

  const form1 = await Form1Docket.create({
    agencyCreatedBy: userId,
    dateRequested: daterequested,
    refAgency: refagency,
    caseType: casetype,
    county,
    agencyRefNumber: agencyrefnumber,
    status: 'pending',
    hearingMode: hearingmode,
    agencyPlatformId: DDS_AGENCY_PLATFORM_ID,
    isFileScanned: '1',
  });

  const isEligible = eligiblepermit === '1';
  const now = new Date();

  await Form1DdsPermitEligibilityEffectivedate.create({
    form1Id: form1.form1Id,
    eligibility: isEligible ? 1 : 0,
    expiryDate: toNullIfZeroDate(expiryDate),
    effectiveDate: toNullIfZeroDate(permiteffectivedate),
    createdDate: now,
    modifiedDate: now,
  });

  await Form1Dds1205Offence.create({
    form1Id: form1.form1Id,
    countyOfOccurences: county,
    ...(isEligible
      ? { incidentDate: toNullIfZeroDate(incidentDate), dob: toNullIfZeroDate(DOB) }
      : {}),
    dateCreatedFor91Days: now,
    dateCreated: now,
  });

  return { form1Id: form1.form1Id, docketNo: '' };
};

export default { addDocket };
