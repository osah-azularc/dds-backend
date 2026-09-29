import Form1Docket from '../models/Form1Docket.js';
import Form1DdsPermitEligibilityEffectivedate from '../models/Form1DdsPermitEligibilityEffectivedate.js';
import Form1Dds1205Offence from '../models/Form1Dds1205Offence.js';
import Form1Parties from '../models/Form1Parties.js';
import Form1Summarytable from '../models/Form1Summarytable.js';
import Form1Rejected from '../models/Form1Rejected.js';
import Form1Approve from '../models/Form1Approve.js';
import DDSHistory from '../models/DDSHistory.js';
import DdsStatusList from '../models/DdsStatusList.js';
import { addHistoryEntry } from './ddsForm1HistoryService.js';
import { buildPermitChangeMessage } from '../helpers/ddsHistoryMessageBuilder.js';
import { logger } from '../../config/winstonLogger.js';

// A history-logging failure should never fail the action it's describing.
async function logHistorySafely(form1Id, message, modifiedBy) {
  try {
    await addHistoryEntry(form1Id, message, modifiedBy);
  } catch (error) {
    logger.error('Error logging ddshistory entry (dds-form1 docket):', error);
  }
}

// DDS's fixed agency platform id (matches DdsForm1Controller::adddocketAction()'s
// hardcoded agency_platform_id => 5). Exported for ddsForm1PartyService.js's Form1Parties
// rows, which need the same agency_id.
export const DDS_AGENCY_PLATFORM_ID = 5;

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

/**
 * Loads a Form 1 docket for the review screen ("Form 1" page reached from
 * Docket Search, /form1/reqdt/<base64 form1_id> in the legacy portal).
 * Ports DdsForm1Controller::searchdocketinfoAction() — a form1_docket row
 * (status resolved to its ddsstatuslist display name, matching the legacy
 * `LEFT JOIN ddsstatuslist ds ON ds.status = f1.status`). Party rows are
 * fetched separately via getPartyList() below (ddsForm1PartyService.js's
 * own dds-form1/get-party-details endpoint, matching legacy's separate
 * getPartyDetailsAction()) rather than bundled into this response.
 *
 * Also fetches the docket's Temporary Permit row (form1_dds_permit_
 * eligibility_effectivedate, one row per docket, written by addDocket()
 * above) plus its form1_dds_1205_offence row (DOB/incident date) for the
 * "Temporary Permit" panel — the legacy equivalent is a generic
 * `Osahform/getdatadynamic` lookup against each table by form1_id, ported
 * here as plain, table-specific Sequelize queries. DOB/incident date are
 * merged into the same permitData row since the frontend panel treats them
 * as one section.
 *
 * Returned as { docketData: [...], permitData: [...] } (each wrapped in a
 * single-item array, permitData empty when the docket predates this table
 * or has no row yet).
 */
export const searchDocketInfo = async (form1Id) => {
  const docket = await Form1Docket.findOne({ where: { form1Id } });
  if (!docket) {
    return { docketData: [], permitData: [] };
  }

  const statusRow = await DdsStatusList.findOne({ where: { status: docket.status } });
  const permitRow = await Form1DdsPermitEligibilityEffectivedate.findOne({ where: { form1Id } });
  const offenceRow = await Form1Dds1205Offence.findOne({ where: { form1Id } });

  const { status: actualStatus, ...docketFields } = docket.toJSON();
  const docketRow = {
    ...docketFields,
    status: statusRow?.displayName ?? null,
    actualStatus,
  };

  const permitData = permitRow || offenceRow
    ? [
        {
          ...(permitRow ? permitRow.toJSON() : {}),
          dob: offenceRow?.dob ?? null,
          incidentDate: offenceRow?.incidentDate ?? null,
        },
      ]
    : [];

  return {
    docketData: [docketRow],
    permitData,
  };
};

/**
 * Resolves the DDS Form 1 whose ecourt_caseid matches the given docket id.
 * Ports DdsForm1Controller::getForm1IdAction() for the Home page header's
 * "Docket Number" quick search (DocketSearch.jsx) -- that box searches by
 * the eCourt case id, so it needs this lookup before it can navigate to
 * /form1/reqdt/:form1Id. Returns null when no Form 1 has that ecourt_caseid
 * (matches legacy's `isset($form1_data[0]) ? $form1_data[0] : array()`).
 */
export const getForm1IdByEcourtCaseId = async (docketId) => {
  const docket = await Form1Docket.findOne({
    where: { ecourtCaseid: docketId },
    attributes: ['form1Id'],
  });

  return docket?.form1Id ?? null;
};

/**
 * Saves the Temporary Permit edits made on the existing-docket review
 * screen (/form1/reqdt/:form1Id). Ports the Temporary Permit portion of
 * DdsForm1Controller::updatedocketAction() — upserts (update-if-exists,
 * else create) the same two tables addDocket() creates rows in:
 *  - form1_dds_permit_eligibility_effectivedate: eligibility/effective/expiry date.
 *  - form1_dds_1205_offence: DOB/incident date.
 * Also writes form1_docket.agencyRefNumber, since legacy's action always
 * overwrites it from the request — matches form1.phtml's
 * `ng-disabled="docketStatus!='Draft'"`, which only lets the agency edit it
 * while the docket is still Draft (the UI sends the unchanged value for any
 * other status, since the field is disabled there).
 * Skips legacy's "cloned"/resubmitted-docket handling (updateClonedForm1)
 * and its temp_permits-reset-on-effective-date-change flag — neither
 * applies to a normal Draft/pending docket, which is what this screen is
 * scoped to for now.
 */
export const updateDocket = async (form1Id, docketDetails, modifiedByName) => {
  const { agencyrefnumber, eligiblepermit, permiteffectivedate, expiryDate, DOB, incidentDate } =
    docketDetails;
  const isEligible = eligiblepermit === '1';
  const now = new Date();

  const previousDocket = await Form1Docket.findOne({ where: { form1Id } });
  const permitRow = await Form1DdsPermitEligibilityEffectivedate.findOne({ where: { form1Id } });
  const offenceRow = await Form1Dds1205Offence.findOne({ where: { form1Id } });

  await Form1Docket.update(
    { agencyRefNumber: agencyrefnumber, isFileScanned: '1' },
    { where: { form1Id } },
  );

  const permitFields = {
    eligibility: isEligible ? 1 : 0,
    effectiveDate: toNullIfZeroDate(permiteffectivedate),
    expiryDate: toNullIfZeroDate(expiryDate),
  };
  if (permitRow) {
    await permitRow.update({ ...permitFields, modifiedDate: now });
  } else {
    await Form1DdsPermitEligibilityEffectivedate.create({
      form1Id,
      ...permitFields,
      createdDate: now,
      modifiedDate: now,
    });
  }

  const offenceFields = {
    incidentDate: toNullIfZeroDate(incidentDate),
    dob: toNullIfZeroDate(DOB),
  };
  if (offenceRow) {
    await offenceRow.update({ ...offenceFields, modifiedDate: now });
  } else {
    await Form1Dds1205Offence.create({
      form1Id,
      ...offenceFields,
      dateCreated: now,
      modifiedDate: now,
    });
  }

  const message = buildPermitChangeMessage(
    {
      agencyRefNumber: previousDocket?.agencyRefNumber ?? null,
      eligibility: String(permitRow?.eligibility ?? '0'),
      effectiveDate: permitRow?.effectiveDate ?? null,
      expiryDate: permitRow?.expiryDate ?? null,
      dob: offenceRow?.dob ?? null,
      incidentDate: offenceRow?.incidentDate ?? null,
    },
    {
      agencyRefNumber: agencyrefnumber,
      eligibility: isEligible ? '1' : '0',
      effectiveDate: permitFields.effectiveDate,
      expiryDate: permitFields.expiryDate,
      dob: offenceFields.dob,
      incidentDate: offenceFields.incidentDate,
    },
  );
  await logHistorySafely(form1Id, message, modifiedByName);
};

/**
 * Deletes a Form1 docket entirely (the existing-docket review screen's "Delete Form1"
 * button, only shown/enabled for a Draft the agency hasn't submitted yet --
 * `actualStatus === 'pending'`, see DocketTabBar.jsx). Ports
 * DdsForm1Controller::deletedocketAction() -- deletes every row tied to the docket across
 * all the tables it ever wrote to, then the docket itself. Sequelize's destroy() is a
 * no-op when no rows match, so this skips legacy's own count-then-delete guards on
 * form1_parties/form1_summarytable/form1_rejected/form1_approve/ddshistory (those tables
 * may have no rows for a still-pending docket) -- form1_dds_1205_offence and
 * form1_dds_permit_eligibility_effectivedate are unconditional deletes in legacy too,
 * since addDocket() always creates one row in each regardless of eligibility.
 */
export const deleteDocket = async (form1Id) => {
  await Form1Parties.destroy({ where: { form1Id } });
  await Form1Summarytable.destroy({ where: { form1Id } });
  await Form1Rejected.destroy({ where: { form1Id } });
  await Form1Approve.destroy({ where: { form1Id } });
  await DDSHistory.destroy({ where: { form1Id } });
  await Form1Dds1205Offence.destroy({ where: { form1Id } });
  await Form1DdsPermitEligibilityEffectivedate.destroy({ where: { form1Id } });
  await Form1Docket.destroy({ where: { form1Id } });
};

export default {
  addDocket,
  searchDocketInfo,
  getForm1IdByEcourtCaseId,
  updateDocket,
  deleteDocket,
};
