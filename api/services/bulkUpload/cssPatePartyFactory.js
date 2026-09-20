import { PeopleDetails } from '../../models/index.js';
import MinorDetails from '../../models/MinorDetails.js';
import PublicAccessUser from '../../models/PublicAccessUser.js';
import { checkEServicesStatus } from './bulkUploadCommonHelpers.js';
import { CSS_PATE_CONSTANTS } from './cssPateHelpers.js';

/**
 * CSS PAT-E Party Factory
 * Created by: Rizwan Hiroli
 * Refactored by: Augment AI
 *
 * Encapsulates record-creation logic for CSS PAT-E parties (custodial parent,
 * respondent and minors) so the orchestration service can stay under the
 * 300-line limit.
 */

/**
 * Create Custodial Parent record (peopledetails)
 */
export async function createCustodialParent(caseId, rowData, currentDatetime, transaction) {
  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.cpFirstName, rowData.cpLastName,
  );

  await PeopleDetails.create({
    docketCaseId: caseId,
    caseId,
    firstName: rowData.cpFirstName,
    lastName: rowData.cpLastName,
    address1: rowData.cpAddress1,
    city: rowData.cpCity,
    state: rowData.cpState,
    zip: rowData.cpZip,
    typeOfContact: CSS_PATE_CONSTANTS.PARTY_TYPE.CUSTODIAL_PARENT,
    eServices: eServicesStatus,
    createdDate: currentDatetime,
    modifiedDate: currentDatetime,
  }, { transaction });
}

/**
 * Create Respondent record and return case name
 */
export async function createRespondent(caseId, rowData, currentDatetime, transaction) {
  const eServicesStatus = await checkEServicesStatus(
    PublicAccessUser, rowData.custodialFirstName, rowData.custodialLastName,
  );

  await PeopleDetails.create({
    docketCaseId: caseId,
    caseId,
    firstName: rowData.custodialFirstName,
    lastName: rowData.custodialLastName,
    address1: rowData.custodialAddress1,
    city: rowData.custodialCity,
    state: rowData.custodialState,
    zip: rowData.custodialZip,
    typeOfContact: CSS_PATE_CONSTANTS.PARTY_TYPE.RESPONDENT,
    eServices: eServicesStatus,
    createdDate: currentDatetime,
    modifiedDate: currentDatetime,
  }, { transaction });

  return `${rowData.custodialLastName}, ${rowData.custodialFirstName}`;
}

/**
 * Create minor detail records (up to 6) using bulk insert
 */
export async function createMinorRecords(caseId, rowData, currentDatetime, transaction) {
  const minorRecords = [];

  for (let j = 1; j <= CSS_PATE_CONSTANTS.MAX_MINORS; j++) {
    const lastName = rowData[`minorLastName${j}`];
    if (lastName) {
      minorRecords.push({
        caseId,
        docketCaseId: caseId,
        firstName: rowData[`minorFirstName${j}`] || '',
        lastName,
        dobYear: rowData[`minorYear${j}`] || null,
        createdDate: currentDatetime,
        modifiedDate: currentDatetime,
      });
    }
  }

  if (minorRecords.length > 0) {
    await MinorDetails.bulkCreate(minorRecords, { transaction });
  }
}

