import { PeopleDetails, AgencyCaseworkerByCase, AttorneyByCase } from '../../models/index.js';
import PublicAccessUser from '../../models/PublicAccessUser.js';
import AgencyCaseworkerByCaseMaster from '../../models/admin/agencyCaseworkerByCaseMasterModel.js';
import AttorneyByCaseMaster from '../../models/admin/attorneyByCaseMasterModel.js';
import { checkEServicesStatus } from './bulkUploadCommonHelpers.js';
import { DFCS_CONSTANTS } from './dfcsHelpers.js';

/**
 * DFCS Party Factory
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Encapsulates record-creation logic for DFCS / DFCS-M parties so the
 * orchestration service can stay under the 300-line limit. Each helper that
 * touches a master table reuses the pre-fetched cache for O(1) dedup.
 */

const PARTY_REQUIRED_FIELDS = {
  petitioner: ['petitionerLastName', 'petitionerFirstName', 'petitionerAddress1', 'petitionerCity', 'petitionerState', 'petitionerZip'],
  petitionerAttorney: ['petitionerAttorneyLastName', 'petitionerAttorneyFirstName', 'petitionerAttorneyAddress1', 'petitionerAttorneyCity', 'petitionerAttorneyState', 'petitionerAttorneyZip'],
  petitionerRep: ['petitionerRepLastName', 'petitionerRepFirstName', 'petitionerRepAddress1', 'petitionerRepCity', 'petitionerRepState', 'petitionerRepZip'],
  caseWorker: ['caseWorkerLastName', 'caseWorkerFirstName', 'caseWorkerAddress1', 'caseWorkerCity', 'caseWorkerState', 'caseWorkerZip'],
  regionalCoordinator: ['regionalCoordinatorLastName', 'regionalCoordinatorFirstName', 'regionalCoordinatorAddress1', 'regionalCoordinatorCity', 'regionalCoordinatorState', 'regionalCoordinatorZip'],
};

/**
 * Check if party has required fields (LN, FN, Address1, City, State, Zip)
 */
export function hasRequiredPartyFields(rowData, prefix) {
  return PARTY_REQUIRED_FIELDS[prefix]?.every((f) => rowData[f]?.trim());
}

/**
 * Get e-services status and bar number from publicaccess_users
 */
export async function getEServicesAndBarNo(firstName, lastName, email) {
  try {
    const whereClause = email ? { firstName, lastName, email } : { firstName, lastName };
    const publicUser = await PublicAccessUser.findOne({
      where: whereClause,
      attributes: ['eServices', 'barNo'],
    });
    return {
      eServicesStatus: publicUser?.eServices || '0',
      barNo: publicUser?.barNo || '',
    };
  } catch {
    return { eServicesStatus: '0', barNo: '' };
  }
}

/**
 * Create Petitioner record in peopledetails
 */
export async function createPetitioner(caseId, rowData, currentDatetime, transaction) {
  if (!hasRequiredPartyFields(rowData, 'petitioner')) return null;

  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.petitionerFirstName, rowData.petitionerLastName, rowData.petitionerEmail,
  );

  await PeopleDetails.create({
    docketCaseId: caseId,
    caseId,
    firstName: rowData.petitionerFirstName,
    lastName: rowData.petitionerLastName,
    address1: rowData.petitionerAddress1,
    address2: rowData.petitionerAddress2,
    city: rowData.petitionerCity,
    state: rowData.petitionerState,
    zip: rowData.petitionerZip,
    email: rowData.petitionerEmail,
    typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.PETITIONER,
    eServices: eServicesStatus,
    createdDate: currentDatetime,
    modifiedDate: currentDatetime,
  }, { transaction });

  return `${rowData.petitionerLastName}, ${rowData.petitionerFirstName}`;
}

/**
 * Create Petitioner Attorney record in attorneybycase (with master dedup)
 */
export async function createPetitionerAttorney(caseId, rowData, currentDatetime, transaction, lookupCache) {
  if (!hasRequiredPartyFields(rowData, 'petitionerAttorney')) return null;

  const { eServicesStatus, barNo } = await getEServicesAndBarNo(
    rowData.petitionerAttorneyFirstName, rowData.petitionerAttorneyLastName, rowData.petitionerAttorneyEmail,
  );

  const masterKey = `${rowData.petitionerAttorneyFirstName}|${rowData.petitionerAttorneyLastName}|${rowData.petitionerAttorneyAddress1}|${DFCS_CONSTANTS.PARTY_TYPE.PETITIONER_ATTORNEY}`;
  if (!lookupCache.attorneyMasterSet.has(masterKey) && !lookupCache.createdMasterKeys.has(masterKey)) {
    await AttorneyByCaseMaster.create({
      docketCaseId: caseId,
      caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.PETITIONER_ATTORNEY,
      firstName: rowData.petitionerAttorneyFirstName,
      lastName: rowData.petitionerAttorneyLastName,
      address1: rowData.petitionerAttorneyAddress1,
      address2: rowData.petitionerAttorneyAddress2,
      city: rowData.petitionerAttorneyCity,
      state: rowData.petitionerAttorneyState,
      zip: rowData.petitionerAttorneyZip,
      email: rowData.petitionerAttorneyEmail,
      attorneyId: 0,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
    lookupCache.createdMasterKeys.add(masterKey);
  }

  const existingAttorney = await AttorneyByCase.findOne({
    where: {
      caseId,
      lastName: rowData.petitionerAttorneyLastName,
      firstName: rowData.petitionerAttorneyFirstName,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.PETITIONER_ATTORNEY,
    },
    transaction,
  });

  if (!existingAttorney) {
    await AttorneyByCase.create({
      caseId,
      docketCaseId: caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.PETITIONER_ATTORNEY,
      firstName: rowData.petitionerAttorneyFirstName,
      lastName: rowData.petitionerAttorneyLastName,
      address1: rowData.petitionerAttorneyAddress1,
      address2: rowData.petitionerAttorneyAddress2,
      city: rowData.petitionerAttorneyCity,
      state: rowData.petitionerAttorneyState,
      zip: rowData.petitionerAttorneyZip,
      email: rowData.petitionerAttorneyEmail,
      attorneyId: 0,
      attorneyBar: barNo,
      eServices: eServicesStatus,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
  }

  return `${rowData.petitionerAttorneyLastName}, ${rowData.petitionerAttorneyFirstName}`;
}

/**
 * Create Representative record in peopledetails
 */
export async function createRepresentative(caseId, rowData, currentDatetime, transaction) {
  if (!hasRequiredPartyFields(rowData, 'petitionerRep')) return null;

  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.petitionerRepFirstName, rowData.petitionerRepLastName, rowData.petitionerRepEmail,
  );

  const existingRep = await PeopleDetails.findOne({
    where: {
      caseId,
      lastName: rowData.petitionerRepLastName,
      firstName: rowData.petitionerRepFirstName,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.REPRESENTATIVE,
    },
    transaction,
  });

  if (!existingRep) {
    await PeopleDetails.create({
      docketCaseId: caseId,
      caseId,
      firstName: rowData.petitionerRepFirstName,
      lastName: rowData.petitionerRepLastName,
      address1: rowData.petitionerRepAddress1,
      address2: rowData.petitionerRepAddress2,
      city: rowData.petitionerRepCity,
      state: rowData.petitionerRepState,
      zip: rowData.petitionerRepZip,
      email: rowData.petitionerRepEmail,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.REPRESENTATIVE,
      eServices: eServicesStatus,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
  }
}

/**
 * Create Case Worker record in agencycaseworkerbycase (with master dedup)
 */
export async function createCaseWorker(caseId, rowData, currentDatetime, transaction, lookupCache) {
  if (!hasRequiredPartyFields(rowData, 'caseWorker')) return null;

  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.caseWorkerFirstName, rowData.caseWorkerLastName,
  );

  const masterKey = `${rowData.caseWorkerFirstName}|${rowData.caseWorkerLastName}|${rowData.caseWorkerAddress1}|${DFCS_CONSTANTS.PARTY_TYPE.CASE_WORKER}`;
  if (!lookupCache.caseworkerMasterSet.has(masterKey) && !lookupCache.createdMasterKeys.has(masterKey)) {
    await AgencyCaseworkerByCaseMaster.create({
      docketCaseId: caseId,
      caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.CASE_WORKER,
      firstName: rowData.caseWorkerFirstName,
      lastName: rowData.caseWorkerLastName,
      address1: rowData.caseWorkerAddress1,
      address2: rowData.caseWorkerAddress2,
      city: rowData.caseWorkerCity,
      state: rowData.caseWorkerState,
      zip: rowData.caseWorkerZip,
      contactId: 0,
      isGeorgiaState: '0',
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
    lookupCache.createdMasterKeys.add(masterKey);
  }

  const existingCaseWorker = await AgencyCaseworkerByCase.findOne({
    where: {
      caseId,
      lastName: rowData.caseWorkerLastName,
      firstName: rowData.caseWorkerFirstName,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.CASE_WORKER,
    },
    transaction,
  });

  if (!existingCaseWorker) {
    await AgencyCaseworkerByCase.create({
      caseId,
      docketCaseId: caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.CASE_WORKER,
      firstName: rowData.caseWorkerFirstName,
      lastName: rowData.caseWorkerLastName,
      address1: rowData.caseWorkerAddress1,
      address2: rowData.caseWorkerAddress2,
      city: rowData.caseWorkerCity,
      state: rowData.caseWorkerState,
      zip: rowData.caseWorkerZip,
      contactId: 0,
      isGeorgiaState: '0',
      eServices: eServicesStatus,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
  }

  return `${rowData.caseWorkerLastName}, ${rowData.caseWorkerFirstName}`;
}

/**
 * Create Regional Coordinator record in agencycaseworkerbycase (with master dedup)
 */
export async function createRegionalCoordinator(caseId, rowData, currentDatetime, transaction, lookupCache) {
  if (!hasRequiredPartyFields(rowData, 'regionalCoordinator')) return null;

  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.regionalCoordinatorFirstName, rowData.regionalCoordinatorLastName,
  );

  const masterKey = `${rowData.regionalCoordinatorFirstName}|${rowData.regionalCoordinatorLastName}|${rowData.regionalCoordinatorAddress1}|${DFCS_CONSTANTS.PARTY_TYPE.REGIONAL_COORDINATOR}`;
  if (!lookupCache.caseworkerMasterSet.has(masterKey) && !lookupCache.createdMasterKeys.has(masterKey)) {
    await AgencyCaseworkerByCaseMaster.create({
      docketCaseId: caseId,
      caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.REGIONAL_COORDINATOR,
      firstName: rowData.regionalCoordinatorFirstName,
      lastName: rowData.regionalCoordinatorLastName,
      address1: rowData.regionalCoordinatorAddress1,
      address2: rowData.regionalCoordinatorAddress2,
      city: rowData.regionalCoordinatorCity,
      state: rowData.regionalCoordinatorState,
      zip: rowData.regionalCoordinatorZip,
      contactId: 0,
      isGeorgiaState: '0',
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
    lookupCache.createdMasterKeys.add(masterKey);
  }

  const existingCoordinator = await AgencyCaseworkerByCase.findOne({
    where: {
      caseId,
      lastName: rowData.regionalCoordinatorLastName,
      firstName: rowData.regionalCoordinatorFirstName,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.REGIONAL_COORDINATOR,
    },
    transaction,
  });

  if (!existingCoordinator) {
    await AgencyCaseworkerByCase.create({
      caseId,
      docketCaseId: caseId,
      typeOfContact: DFCS_CONSTANTS.PARTY_TYPE.REGIONAL_COORDINATOR,
      firstName: rowData.regionalCoordinatorFirstName,
      lastName: rowData.regionalCoordinatorLastName,
      address1: rowData.regionalCoordinatorAddress1,
      address2: rowData.regionalCoordinatorAddress2,
      city: rowData.regionalCoordinatorCity,
      state: rowData.regionalCoordinatorState,
      zip: rowData.regionalCoordinatorZip,
      contactId: 0,
      isGeorgiaState: '0',
      eServices: eServicesStatus,
      createdDate: currentDatetime,
      modifiedDate: currentDatetime,
    }, { transaction });
  }
}

