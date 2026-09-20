import { PeopleDetails, AgencyCaseworkerByCase } from '../../models/index.js';
import PublicAccessUser from '../../models/PublicAccessUser.js';
import AgencyCaseworkerByCaseMaster from '../../models/admin/agencyCaseworkerByCaseMasterModel.js';
import { checkEServicesStatus } from './bulkUploadCommonHelpers.js';
import { OIG_EBT_CONSTANTS } from './oigEbtHelpers.js';

/**
 * OIG EBT Party Factory
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Encapsulates record-creation logic for OIG EBT parties (Respondent in
 * peopledetails + Investigator in agencycaseworkerbycase, plus master record
 * dedup) so the orchestration service can stay under the 300-line limit.
 */

/**
 * Create Respondent record in peopledetails and return case name
 */
export async function createRespondent(caseId, rowData, currentDatetime, transaction) {
  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.respondentFirstName, rowData.respondentLastName,
  );

  await PeopleDetails.create({
    docketCaseId: caseId,
    caseId,
    firstName: rowData.respondentFirstName,
    lastName: rowData.respondentLastName,
    address1: rowData.respondentAddress1,
    address2: rowData.respondentAddress2,
    city: rowData.respondentCity,
    state: rowData.respondentState,
    zip: rowData.respondentZip,
    typeOfContact: OIG_EBT_CONSTANTS.PARTY_TYPE.RESPONDENT,
    eServices: eServicesStatus,
    createdDate: currentDatetime,
    modifiedDate: currentDatetime,
  }, { transaction });

  return `${rowData.respondentLastName}, ${rowData.respondentFirstName}`;
}

/**
 * Create Investigator record in agencycaseworkerbycase and return state
 * representative name. Also dedups the master record using the pre-fetched
 * cache (O(1) lookup eliminates N+1 queries).
 */
export async function createInvestigator(caseId, rowData, currentDatetime, transaction, lookupCache) {
  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.investigatorFirstName, rowData.investigatorLastName,
  );

  const masterKey = `${rowData.investigatorFirstName}|${rowData.investigatorLastName}|${rowData.investigatorAddress1}|${OIG_EBT_CONSTANTS.PARTY_TYPE.INVESTIGATOR}`;
  const existsInDb = lookupCache.investigatorMasterSet.has(masterKey);
  const createdInBatch = lookupCache.createdMasterKeys.has(masterKey);

  if (!existsInDb && !createdInBatch) {
    await AgencyCaseworkerByCaseMaster.create({
      typeOfContact: OIG_EBT_CONSTANTS.PARTY_TYPE.INVESTIGATOR,
      lastName: rowData.investigatorLastName,
      firstName: rowData.investigatorFirstName,
      address1: rowData.investigatorAddress1,
      city: rowData.investigatorCity,
      state: rowData.investigatorState,
      zip: rowData.investigatorZip,
      contactId: 0,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
    lookupCache.createdMasterKeys.add(masterKey);
  }

  const existingCaseRecord = await AgencyCaseworkerByCase.findOne({
    where: {
      caseId,
      typeOfContact: OIG_EBT_CONSTANTS.PARTY_TYPE.INVESTIGATOR,
    },
    transaction,
  });

  if (!existingCaseRecord) {
    await AgencyCaseworkerByCase.create({
      caseId,
      docketCaseId: caseId,
      typeOfContact: OIG_EBT_CONSTANTS.PARTY_TYPE.INVESTIGATOR,
      firstName: rowData.investigatorFirstName,
      lastName: rowData.investigatorLastName,
      address1: rowData.investigatorAddress1,
      city: rowData.investigatorCity,
      state: rowData.investigatorState,
      zip: rowData.investigatorZip,
      contactId: 0,
      eServices: eServicesStatus,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
  }

  return `${rowData.investigatorLastName}, ${rowData.investigatorFirstName}`;
}

