import { mysqlSequelize } from '../../../connections/seqDB.js';
import Form1Docket from '../../models/Form1Docket.js';
import Form1Documents from '../../models/Form1Documents.js';
import Form1Rejected from '../../models/Form1Rejected.js';
import Form1Approve from '../../models/Form1Approve.js';
import Docket from '../../models/Docket.js';
import DocketOpenCloseDetails from '../../models/DocketOpenCloseDetails.js';
import County from '../../models/County.js';
import Casetypes from '../../models/Casetypes.js';
import { getHearingInfoByCasetypeAndCounty, checkSkipHearing, insertDocketHistory } from '../../helpers/osahForm1Helper.js';
import {
  getForm1Parties,
  copyPartiesToDocket,
  prepareDocumentCopies,
  createDocumentRecords,
  cloneForm1Parties,
  cloneForm1Documents,
  cloneTollViolations,
  cloneAdditionalInfo,
  cloneGeneralInfoOtherOption,
  cloneDdsForm1Data,
} from '../../helpers/reviewForm1/reviewForm1ApprovalHelper.js';
import { attachForm1PrintPdf } from '../../helpers/reviewForm1/reviewForm1PrintHelper.js';
import { generateNOH } from '../../helpers/docketQuickAction/nohQuickActionHelper.js';
import { writeApprovalHistory } from '../../helpers/reviewForm1/reviewForm1ApprovalHistoryHelper.js';
import { copyDdsDataToDocket } from '../../helpers/reviewForm1/reviewForm1DdsApprovalHelper.js';
import { logger } from '../../../config/winstonLogger.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Approve/Reject actions for Form 1 review — docket creation with
                hearing auto-assignment, party/document copy, DDS/DCH/Toll
                platform-specific data, combined NOH generation, and the reject-clone flow for resubmission.
*/

function getJudgeFirstSegment(judgeName) {
  if (!judgeName || typeof judgeName !== 'string') return 'Unassigned';
  return judgeName.trim().split(/\s+/)[0] || 'Unassigned';
}

/** Converts legacy "MM-DD-YYYY" to "YYYY-MM-DD"; null if not parseable. */
function legacyDateToIso(mmddyyyy) {
  if (!mmddyyyy || typeof mmddyyyy !== 'string') return null;
  const parts = mmddyyyy.split('-');
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}

/** Derives the docket's "State Representative" display field (mirrors legacy PHP). */
function resolveStateRepresentative(agencyPlatformId, parties, fallback) {
  const platform = Number(agencyPlatformId);
  let targetType = null;
  if (platform === 1) targetType = 'Agency Contact';
  else if ([2, 3, 4].includes(platform)) targetType = 'Case Worker';
  else if (platform === 7) targetType = 'Agency Contact';
  if (!targetType) return fallback || '';
  const match = parties.find((p) => p.typeOfContact === targetType);
  return match ? `${match.lastName}, ${match.firstName}` : '';
}

/**
 * Looks up the Form 1's casetype row once — hearing assignment only needs
 * caseTypeId, but NOH-eligibility (later in approveForm1) also needs agencyId,
 * so both are fetched here and reused instead of querying Casetypes twice.
 */
async function findCasetypeRow(form1) {
  return Casetypes.findOne({
    where: { caseCode: form1.caseType, agencyCode: form1.refAgency },
    attributes: ['caseTypeId', 'agencyId'],
  });
}

/** Hardcoded DPS/County-161 rule, else calendar auto-assignment (mirrors legacy PHP). */
async function resolveHearingAssignment(form1, countyId, caseTypeRow) {
  if (countyId === '161' && form1.caseType === 'DPS') {
    return {
      judge_name: 'Malihi Michael',
      cma_name: 'Hightower Victoria',
      court_location: 'OSAH - Office of State Administrative Hearings',
      time: '09:00:00',
      time_id: '4',
      hearingDate: null,
    };
  }
  const casetypeId = caseTypeRow ? caseTypeRow.caseTypeId : 0;
  const hearingResult = await getHearingInfoByCasetypeAndCounty(casetypeId, countyId);

  // Approval wipes the auto-assigned slot for hearingdateskip casetypes (docket created 'Pending', no NOH), even when the calendar found a slot.
  if (casetypeId && (await checkSkipHearing(casetypeId))) {
    return {
      ...hearingResult,
      hearing_date: '',
      hearingDate: '',
      time: '',
      court_location: '',
    };
  }
  return hearingResult;
}

/**
 * Approves a submitted Form 1: creates the docket, auto-assigns a hearing slot,
 * copies parties/documents, writes history, and generates the NOH document too (when eligible) — all in one call, mirroring legacy reviewformapproveAction().
 */
export async function approveForm1(form1Id, { userId, userName, approveReason, nohType, newHearingDate, newHearingTime }) {
  const form1 = await Form1Docket.findOne({ where: { form1Id } });
  if (!form1) {
    const err = new Error('Form 1 record not found');
    err.status = 404;
    throw err;
  }
  if (form1.status !== 'submitted') {
    const err = new Error('Form 1 is not in submitted status');
    err.status = 400;
    throw err;
  }

  // Fetch once, reuse below for both hearing assignment and NOH eligibility
  // (previously queried twice with the identical where clause).
  const caseTypeRowPromise = findCasetypeRow(form1);

  // Independent lookups — run concurrently instead of one-by-one.
  const [parties, documents, caseTypeRow, { countyId, hearingResult }] = await Promise.all([
    getForm1Parties(form1Id),
    Form1Documents.findAll({ where: { form1Id, isScanned: '1' } }),
    caseTypeRowPromise,
    (async () => {
      const countyRow = await County.findOne({ where: { countyDescription: form1.county } });
      const resolvedCountyId = countyRow ? String(countyRow.countyId) : '0';
      return { countyId: resolvedCountyId, hearingResult: await resolveHearingAssignment(form1, resolvedCountyId, await caseTypeRowPromise) };
    })(),
  ]);
  const staterepresentative = resolveStateRepresentative(form1.agencyPlatformId, parties, form1.stateRepresentative);
  const hearingDateIso = legacyDateToIso(hearingResult.hearingDate);

  const docketCreatePayload = {
    refAgency: form1.refAgency,
    caseType: form1.caseType,
    county: form1.county,
    dateRequested: form1.dateRequested,
    agencyRefNumber: form1.agencyRefNumber,
    hearingMode: hearingResult.hearingmode || 'In Person',
    dateReceivedByOSAH: form1.dateReceivedByOSAH,
    hearingSite: hearingResult.court_location || '',
    hearingDate: hearingDateIso,
    hearingTime: hearingResult.time || null,
    stateRepresentative: staterepresentative,
    judge: hearingResult.judge_name || '',
    judgeAssistant: hearingResult.cma_name || '',
    docketClerk: form1.docketClerk,
    status: hearingDateIso ? 'Hearing Scheduled' : 'Pending',
    hearingTimeId: hearingResult.time_id || 0,
    caseName: form1.caseName,
    telvOFive: '1',
    attorneyForPetitioner: form1.attorneyForPetitioner,
    staffAttorney: form1.staffAttorney,
    docketCreatedDate: form1.docketCreatedDate,
  };

  const { docketId, addedParties, addedDocuments } = await mysqlSequelize.transaction(async (transaction) => {
    const newDocket = await Docket.create(docketCreatePayload, { transaction });
    const newDocketId = newDocket.caseId;
    const judgeSegment = getJudgeFirstSegment(hearingResult.judge_name);
    const newDocketNumber = [form1.refAgency, form1.caseType, newDocketId, countyId, judgeSegment].join('-');
    await Docket.update({ docketNumber: newDocketNumber }, { where: { caseId: newDocketId }, transaction });

    await DocketOpenCloseDetails.create(
      { caseId: newDocketId, docketStatus: 'open', userId },
      { transaction },
    );

    // copyPartiesToDocket (DB writes on this transaction) and prepareDocumentCopies
    // (pure filesystem I/O, no DB) touch no shared resource, so they run concurrently.
    const [partiesAdded, copiedFiles] = await Promise.all([
      copyPartiesToDocket(form1, parties, newDocketId, transaction),
      prepareDocumentCopies(documents, newDocketId),
    ]);
    const documentsAdded = await createDocumentRecords(copiedFiles, newDocketId, transaction);

    if (Number(form1.agencyPlatformId) === 5) {
      await copyDdsDataToDocket(form1Id, newDocketId, transaction);
    }

    await Form1Approve.create({ form1Id, reason: approveReason }, { transaction });

    await form1.update(
      {
        ecourtCaseid: newDocketId,
        docketNumber: newDocketNumber,
        hearingDate: hearingDateIso,
        hearingTime: hearingResult.time || null,
        hearingTimeId: hearingResult.time_id || 0,
        judge: hearingResult.judge_name || '',
        judgeAssistant: hearingResult.cma_name || '',
        hearingSite: hearingResult.court_location || '',
        status: 'approved',
        telvOFive: '1',
      },
      { transaction },
    );
    return { docketId: newDocketId, addedParties: partiesAdded, addedDocuments: documentsAdded };
  });

  // History writes happen post-commit, outside the transaction.
  await writeApprovalHistory(
    { ...docketCreatePayload, agencyCreatedBy: form1.agencyCreatedBy },
    docketId,
    form1Id,
    userName,
    addedParties,
    addedDocuments,
  );
  // Best-effort, backgrounded — no-ops if no "form1" print template is mapped;
  // not awaited since approval already succeeded and PDF conversion is slow.
  attachForm1PrintPdf(docketId, { refAgency: form1.refAgency, caseType: form1.caseType })
    .then((attachedPrintPdf) => {
      if (!attachedPrintPdf) return null;
      return insertDocketHistory(
        docketId,
        `<p class="history-title">Form 1 print document (${attachedPrintPdf}) was attached from Form 1 approval.</p>`,
        userName,
      );
    })
    .catch((error) => logger.error(`[ReviewForm1ApprovalService] Background Form1 print PDF attach failed for docketId=${docketId}:`, error));

  // Generate NOH when eligible: complete auto-assigned slot, party count <=6, and the client supplied nohType/newHearingDate/newHearingTime.
  let automationFlag = false;
  if (
    hearingDateIso && hearingResult.time && hearingResult.court_location
    && hearingResult.judge_name && hearingResult.cma_name
    && parties.length <= 6 && nohType && newHearingDate && newHearingTime
  ) {
    const nohResult = await generateNOH(
      {
        agencyCode: form1.refAgency,
        casetype: form1.caseType,
        automationSubType: nohType,
        caseId: docketId,
        allParties: addedParties.map((p) => p.typeOfContact),
        caseName: form1.caseName,
        agencyId: caseTypeRow ? caseTypeRow.agencyId : null,
        caseTypeId: caseTypeRow ? caseTypeRow.caseTypeId : null,
        newHearingDate,
        newHearingTime,
        getDateReceived: form1.dateReceivedByOSAH,
        judge: hearingResult.judge_name,
        cma: hearingResult.cma_name,
      },
      userName,
      userId,
    );
    automationFlag = !!nohResult?.success;
  }
  return { automationFlag };
}

/** Rejects a submitted Form 1 and clones it into a resubmittable record (unless already a resubmission). */
export async function rejectForm1(form1Id, { reason, reasonType }) {
  const form1 = await Form1Docket.findOne({ where: { form1Id } });
  if (!form1) {
    const err = new Error('Form 1 record not found');
    err.status = 404;
    throw err;
  }
  if (form1.status !== 'submitted') {
    const err = new Error('Form 1 is not in submitted status');
    err.status = 400;
    throw err;
  }

  await mysqlSequelize.transaction(async (transaction) => {
    await form1.update({ status: 'rejected' }, { transaction });
    await Form1Rejected.create({ form1Id, reason, reasonType }, { transaction });

    if (form1.isResubmitted !== '1') {
      const clonedFields = form1.toJSON();
      delete clonedFields.form1Id;
      delete clonedFields.ecourtCaseid;
      delete clonedFields.docketNumber;

      const cloned = await Form1Docket.create(
        {
          ...clonedFields,
          status: 'cloned',
          childForm1Id: null,
          docketCreatedDate: new Date(),
        },
        { transaction },
      );

      await cloneForm1Parties(form1Id, cloned.form1Id, transaction);
      // Each platform has its own additional table(s) to carry over to the clone.
      const platform = Number(form1.agencyPlatformId);
      if (platform === 1) {
        await cloneTollViolations(form1Id, cloned.form1Id, transaction);
      } else if ([2, 3, 4, 7].includes(platform)) {
        await cloneAdditionalInfo(form1Id, cloned.form1Id, transaction);
        if (platform === 7) {
          await cloneGeneralInfoOtherOption(form1Id, cloned.form1Id, transaction);
        }
      } else if (platform === 5) {
        await cloneDdsForm1Data(form1Id, cloned.form1Id, transaction);
      }

      // Documents aren't cloned for DDS (5) — mirrors legacy PHP.
      if (platform !== 5) {
        await cloneForm1Documents(form1Id, cloned.form1Id, transaction);
      }
      await form1.update({ childForm1Id: cloned.form1Id }, { transaction });
    }
  });
}
