import path from 'node:path';
import fs from 'node:fs';
import { Op } from 'sequelize';
import Form1Parties from '../../models/Form1Parties.js';
import Form1Documents from '../../models/Form1Documents.js';
import AgencyPlatformParties from '../../models/AgencyPlatformParties.js';
import TypeOfContact from '../../models/TypeOfContact.js';
import PeopleDetails from '../../models/PeopleDetails.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';
import MinorDetails from '../../models/MinorDetails.js';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import Form1DocketGeneralinfoOtherOption from '../../models/Form1DocketGeneralinfoOtherOption.js';
import Form1Dds1205Offence from '../../models/Form1Dds1205Offence.js';
import Form1DdsPermitEligibilityEffectivedate from '../../models/Form1DdsPermitEligibilityEffectivedate.js';
import Form1Summarytable from '../../models/Form1Summarytable.js';
import DDSHistory from '../../models/DDSHistory.js';
import TollViolations from '../../models/TollViolations.js';
import AdditionalInfo from '../../models/AdditionalInfo.js';
import fileOperationsService from '../../services/efiling/fileOperationsService.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Party/document copy + clone helpers (incl. Toll/DCH/DDS) for Form 1 approve/reject.
*/

const PARTY_TABLE_MODELS = {
  peopledetails: PeopleDetails,
  attorneybycase: AttorneyByCase,
  agencycaseworkerbycase: AgencyCaseworkerByCase,
  minordetails: MinorDetails,
};

export async function getForm1Parties(form1Id) {
  return Form1Parties.findAll({ where: { form1Id }, raw: true });
}

async function getEcourtVisiblePartyTypes(agencyPlatformId) {
  const rows = await AgencyPlatformParties.findAll({
    where: { agencyPlatformId, showInEcourt: '1' },
    attributes: ['ecourtTypeOfContact'],
    raw: true,
  });
  return rows.map((r) => r.ecourtTypeOfContact);
}

function buildPartyPayload(party, docketId) {
  return {
    caseId: docketId,
    docketCaseId: docketId,
    typeOfContact: party.typeOfContact,
    lastName: party.lastName,
    firstName: party.firstName,
    middleName: party.middleName,
    address1: party.address1,
    address2: party.address2,
    city: party.city,
    state: party.state,
    zip: party.zip,
    phone: party.phone,
    email: party.email,
    fax: party.fax,
    attorneyBar: party.attorneyBar || party.georgiaBarNo || null,
    title: party.title,
    company: party.company,
    isInternationalAddr: party.isInternationalAddr || '0',
    internationalAddress: party.internationalAddress,
    altAddress1: party.altAddress1,
    altAddress2: party.altAddress2,
    altCity: party.altCity,
    altState: party.altState,
    altZipCode: party.altZipCode,
  };
}

export async function copyPartiesToDocket(form1, parties, docketId, transaction) {
  const visibleTypes = await getEcourtVisiblePartyTypes(form1.agencyPlatformId);
  const eligibleParties = parties.filter(
    (party) => visibleTypes.includes(party.typeOfContact) && party.lastName && party.firstName,
  );

  const uniqueTypes = [...new Set(eligibleParties.map((party) => party.typeOfContact))];
  const contactRows = uniqueTypes.length
    ? await TypeOfContact.findAll({ where: { partyContact: { [Op.in]: uniqueTypes } } })
    : [];
  const tableNameByType = new Map(contactRows.map((row) => [row.partyContact, row.tableName]));

  // Group by target model: one bulkCreate per table instead of one create() per party.
  const rowsByModel = new Map();
  const added = [];
  for (const party of eligibleParties) {
    const Model = PARTY_TABLE_MODELS[tableNameByType.get(party.typeOfContact)];
    if (!Model) continue;

    if (!rowsByModel.has(Model)) rowsByModel.set(Model, []);
    rowsByModel.get(Model).push(buildPartyPayload(party, docketId));
    added.push(party);
  }

  for (const [Model, rows] of rowsByModel.entries()) {
    await Model.bulkCreate(rows, { transaction });
  }

  return added;
}

/**
 * Copies scanned Form 1 documents to the new docket's storage location on disk.
 * Pure filesystem I/O — no DB/transaction involved — so callers can run this
 * concurrently with unrelated DB writes on the same transaction.
 * @returns {Promise<{relativePath: string, documentName: string}[]>}
 */
export async function prepareDocumentCopies(documents, docketId) {
  const nodeEnv = process.env.NODE_ENV || 'local';

  const toCopy = documents
    .map((doc) => {
      const webPath = doc.documentFilePath;
      if (!webPath) return null;

      const sourcePath = ['dev', 'stag', 'uat', 'prod'].includes(nodeEnv)
        ? path.join(process.env.EFS_BASE_PATH, webPath)
        : path.join(process.cwd(), 'public', webPath);
      if (!fs.existsSync(sourcePath)) return null;

      const documentName = path.basename(webPath);
      const { filePath: destPath, relativePath } = fileOperationsService.generateApprovedDocumentPath(
        docketId,
        'OSAHForm1 - initial docs',
        documentName,
      );
      return { sourcePath, destPath, relativePath, documentName };
    })
    .filter(Boolean);

  await Promise.all(toCopy.map(({ sourcePath, destPath }) => fileOperationsService.copyFileLocal(sourcePath, destPath))); // fs I/O, safe concurrently

  return toCopy.map(({ relativePath, documentName }) => ({ relativePath, documentName }));
}

/** Writes DocumentsTable + AttachmentPathsModel rows for files already copied via prepareDocumentCopies. */
export async function createDocumentRecords(copiedFiles, docketId, transaction) {
  const copied = [];
  for (const { relativePath, documentName } of copiedFiles) {
    const docRecord = await DocumentsTable.create(
      {
        caseId: docketId,
        docketCaseId: docketId,
        documentType: 'OSAHForm1 - initial docs',
        documentName,
        dateRequested: new Date().toISOString().slice(0, 10),
        createdDate: new Date(),
        modifiedDate: new Date(),
      },
      { transaction },
    );

    await AttachmentPathsModel.create(
      { documentId: docRecord.documentId, attachmentPath: relativePath },
      { transaction },
    );

    copied.push(documentName);
  }

  return copied;
}

export async function cloneForm1Parties(sourceForm1Id, newForm1Id, transaction) {
  const parties = await Form1Parties.findAll({ where: { form1Id: sourceForm1Id }, raw: true, transaction });
  if (!parties.length) return;

  const clones = parties.map((party) => {
    const clone = { ...party, form1Id: newForm1Id };
    delete clone.partyId;
    return clone;
  });
  await Form1Parties.bulkCreate(clones, { transaction });
}

export async function cloneForm1Documents(sourceForm1Id, newForm1Id, transaction) {
  const documents = await Form1Documents.findAll({ where: { form1Id: sourceForm1Id }, raw: true, transaction });
  if (!documents.length) return;

  const clones = documents.map((doc) => ({
    form1Id: newForm1Id,
    agencyId: doc.agencyId,
    documentType: doc.documentType,
    documentName: doc.documentName,
    documentFilePath: doc.documentFilePath,
    isScanned: doc.isScanned,
  }));
  await Form1Documents.bulkCreate(clones, { transaction });
}

export async function cloneTollViolations(sourceForm1Id, newForm1Id, transaction) { // Toll (agency_platform_id 1)
  const source = await TollViolations.findOne({ where: { form1Id: sourceForm1Id }, transaction });
  if (!source) return;
  await TollViolations.create(
    {
      form1Id: newForm1Id,
      noOfViolations: source.noOfViolations,
      tollFees: source.tollFees,
      statutoryFees: source.statutoryFees,
      agencyId: source.agencyId,
      createdDate: source.createdDate,
      createdBy: source.createdBy,
      modifiedDate: source.modifiedDate,
      modifiedBy: source.modifiedBy,
    },
    { transaction },
  );
}

export async function cloneAdditionalInfo(sourceForm1Id, newForm1Id, transaction) { // DFCS/DCH (agency_platform_id 2/3/4/7)
  const rows = await AdditionalInfo.findAll({ where: { form1Id: sourceForm1Id }, raw: true, transaction });
  if (!rows.length) return;

  const clones = rows.map((row) => ({ form1Id: newForm1Id, additionalInfoId: row.additionalInfoId }));
  await AdditionalInfo.bulkCreate(clones, { transaction });
}

export async function cloneGeneralInfoOtherOption(sourceForm1Id, newForm1Id, transaction) { // DCH only (agency_platform_id 7)
  const source = await Form1DocketGeneralinfoOtherOption.findOne({ where: { form1Id: sourceForm1Id }, transaction });
  if (!source) return;
  await Form1DocketGeneralinfoOtherOption.create(
    {
      form1Id: newForm1Id,
      benefitsContinued: source.benefitsContinued,
      heringRequestAgency: source.heringRequestAgency,
      dateAppealReceivedOsah: source.dateAppealReceivedOsah,
      benefitesContinuedAns: source.benefitesContinuedAns,
      adverseActionIssueDate: source.adverseActionIssueDate,
      agencyAction: source.agencyAction,
      expeditedAppeal: source.expeditedAppeal,
    },
    { transaction },
  );
}

// DDS (agency_platform_id 5): offence/permit/notes/history (docketCaseId/caseId 0 — no docket yet).
export async function cloneDdsForm1Data(sourceForm1Id, newForm1Id, transaction) {
  const offence = await Form1Dds1205Offence.findOne({ where: { form1Id: sourceForm1Id }, transaction });
  if (offence) {
    await Form1Dds1205Offence.create(
      {
        form1Id: newForm1Id,
        officerId: offence.officerId,
        citiation: offence.citiation,
        countyOfOccurences: offence.countyOfOccurences,
        incidentDate: offence.incidentDate,
        incidentTime: offence.incidentTime,
        officerBadgeNumber: offence.officerBadgeNumber,
        commercialVehicle: offence.commercialVehicle,
        hazourdousVehicle: offence.hazourdousVehicle,
        stateOfIssue: offence.stateOfIssue,
        licenseClassId: offence.licenseClassId,
        dob: offence.dob,
        restrictions: offence.restrictions,
        gender: offence.gender,
        height: offence.height,
        weight: offence.weight,
        driverRequest: offence.driverRequest,
        telvOFive: offence.telvOFive,
        dateCreated: offence.dateCreated,
        dateCreatedFor91Days: offence.dateCreatedFor91Days,
        isNewOfficer: offence.isNewOfficer,
        isNewAttorney: offence.isNewAttorney,
      },
      { transaction },
    );
  }

  const permitEligibility = await Form1DdsPermitEligibilityEffectivedate.findOne({
    where: { form1Id: sourceForm1Id },
    transaction,
  });
  if (permitEligibility) {
    await Form1DdsPermitEligibilityEffectivedate.create(
      {
        form1Id: newForm1Id,
        effectiveDate: permitEligibility.effectiveDate,
        eligibility: permitEligibility.eligibility,
        expiryDate: permitEligibility.expiryDate,
        permitPrintDate: permitEligibility.permitPrintDate,
      },
      { transaction },
    );
  }

  const summaryNote = await Form1Summarytable.findOne({ where: { form1Id: sourceForm1Id }, transaction });
  if (summaryNote) {
    await Form1Summarytable.create(
      { form1Id: newForm1Id, date: summaryNote.date, summaryNotes: summaryNote.summaryNotes, updatedBy: summaryNote.updatedBy },
      { transaction },
    );
  }

  const historyRows = await DDSHistory.findAll({ where: { form1Id: sourceForm1Id }, transaction });
  if (historyRows.length) {
    await DDSHistory.bulkCreate(
      historyRows.map((row) => ({
        form1Id: newForm1Id,
        date: row.date,
        description: row.description,
        modifiedBy: row.modifiedBy,
        docketCaseId: 0,
        caseId: 0,
        createdTime: row.createdTime,
      })),
      { transaction },
    );
  }
}
