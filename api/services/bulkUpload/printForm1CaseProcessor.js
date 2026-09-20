import fs from 'node:fs/promises';
import path from 'node:path';
import { Op } from 'sequelize';
import PeopleDetails from '../../models/PeopleDetails.js';
import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import History from '../../models/History.js';
import { escapeHtml } from '../../utilities/htmlEscape.js';
import {
  getStorageRoot,
  formatDate,
  formatTime,
  safeVal,
  reformatDocketNumber,
  renderTemplate,
} from './printForm1Helpers.js';

/**
 * Generates one DDS Form 1 PDF for a single case, writes it to the filesystem,
 * records it in documentstable + attachmentpaths, writes a history entry, and
 * copies the PDF into the shared zip staging folder.
 *
 * Legacy: OsahformController::printpdfmultipletimes()
 *
 * @param {Object} options
 * @param {Object} options.caseData     - { docket, offence, officer, permit, attorney, driverReq }
 * @param {string} options.template     - Raw HTML template string (read once per batch)
 * @param {string} options.zipFolder    - Absolute path to the zip staging folder
 * @param {Object} options.defaultNames - Fallback { petitioner, respondent } from casetypestyling
 * @param {number} options.userId
 * @param {string} options.userEmail
 * @param {import('puppeteer').Browser} options.browser
 */
export const processCase = async ({ caseData, template, zipFolder, defaultNames, userId, userEmail, browser }) => {
  const { docket, offence, officer, permit, attorney, driverReq } = caseData;
  const caseId = docket.caseId;
  const pdfName = `${caseId}_ddsform1`;
  const storageRoot = getStorageRoot();

  const people = await PeopleDetails.findAll({
    where: {
      caseId,
      typeOfContact: { [Op.in]: ['Petitioner', 'Respondent'] },
    },
  });

  let petitionerName = defaultNames.petitioner;
  let respondentName = defaultNames.respondent;
  let petitioner = {
    lastName: '-', firstName: '-', middleName: '-',
    address1: '-', address2: '-', city: '-', state: '-',
    zip: '-', email: '-', phone: '-', fax: '-',
  };

  for (const person of people) {
    if (person.typeOfContact === 'Petitioner') {
      petitioner = person;
      petitionerName = `${person.lastName}, ${person.firstName}`;
    } else if (person.typeOfContact === 'Respondent') {
      respondentName = `${person.lastName}, ${person.firstName}`;
    }
  }

  const updatedDocketNumber = reformatDocketNumber(docket.docketNumber);

  let feet = '-';
  let inches = '-';
  if (offence.height && offence.height !== 'Null') {
    const parts = String(offence.height).split("'");
    if (parts.length >= 2) {
      feet   = parts[0];
      inches = parts[1];
    }
  }

  const tokens = {
    // Header
    DOCKET_NUMBER:  escapeHtml(updatedDocketNumber),
    PETITIONER_NAME: escapeHtml(petitionerName),
    RESPONDENT_NAME: escapeHtml(respondentName),
    CREATED_BY:     safeVal(docket.docketClerk),

    // Docket Information
    AGENCY_CODE: safeVal(docket.refAgency),
    CASE_TYPE:   safeVal(docket.caseType),
    COUNTY:      safeVal(docket.county),
    STATUS:      safeVal(docket.status),

    // Additional Information
    DATE_REQUESTED:       formatDate(docket.dateRequested),
    DATE_RECEIVED:        formatDate(docket.dateReceivedByOSAH),
    AGENCY_REF_NUMBER:    safeVal(docket.agencyRefNumber),
    HEARING_TYPE:         safeVal(docket.hearingMode),
    DATE_ENTERED:         formatDate(docket.hearingDate),
    ELIGIBLE_FOR_PERMIT:  String(permit.eligibility) === '1' ? 'Yes' : 'No',
    PERMIT_EFFECTIVE_DATE: formatDate(permit.effectiveDate),
    PERMIT_EXPIRATION_DATE: formatDate(permit.expiryDate),

    // Incident Information
    CITATION:             safeVal(offence.citiation),
    COUNTY_OF_OCCURRANCE: safeVal(docket.county),
    INCIDENT_DATE:        formatDate(offence.incidentDate),
    INCIDENT_TIME:        formatTime(offence.incidentTime),
    OFFICER_BADGE_NUMBER: safeVal(offence.officerBadgeNumber),
    COMMERCIAL_VEHICLE:   offence.commercialVehicle === '1' ? 'Yes' : 'No',
    HAZARDOUS_MATERIALS:  offence.hazourdousVehicle === '1' ? 'Yes' : 'No',
    STATE_OF_ISSUE:       safeVal(offence.stateOfIssue),
    LICENCE_CLASS:        safeVal(offence.licenseClassId),
    DATE_OF_BIRTH:        formatDate(offence.dob),
    RESTRICTIONS:         safeVal(offence.restrictions),
    GENDER:               offence.gender === '1' ? 'Female' : 'Male',
    HEIGHT_FEET:          escapeHtml(feet),
    HEIGHT_INCHES:        escapeHtml(inches),
    WEIGHT:               safeVal(offence.weight),
    DRIVER_TEST:          safeVal(driverReq.options),

    // Petitioner Information
    PET_LAST_NAME:      safeVal(petitioner.lastName),
    PET_FIRST_NAME:     safeVal(petitioner.firstName),
    PET_MIDDLE_NAME:    safeVal(petitioner.middleName),
    PET_LICENCE_NUMBER: safeVal(docket.agencyRefNumber),
    PET_ADDRESS1:       safeVal(petitioner.address1),
    PET_ADDRESS2:       safeVal(petitioner.address2),
    PET_CITY:           safeVal(petitioner.city),
    PET_STATE:          safeVal(petitioner.state),
    PET_ZIP:            safeVal(petitioner.zip),
    PET_PHONE:          safeVal(petitioner.phone),
    PET_EMAIL:          safeVal(petitioner.email),
    PET_FAX:            safeVal(petitioner.fax),

    // Petitioner Attorney Information
    IS_NEW_ATTORNEY: String(offence.isNewAttorney) === '1' ? 'Yes' : 'No',
    ATT_LAST_NAME:   safeVal(attorney.lastName),
    ATT_FIRST_NAME:  safeVal(attorney.firstName),
    ATT_MIDDLE_NAME: safeVal(attorney.middleName),
    ATT_GA_BAR:      safeVal(attorney.attorneyBar),
    ATT_ADDRESS1:    safeVal(attorney.address1),
    ATT_ADDRESS2:    safeVal(attorney.address2),
    ATT_CITY:        safeVal(attorney.city),
    ATT_STATE:       safeVal(attorney.state),
    ATT_ZIP:         safeVal(attorney.zip),
    ATT_PHONE:       safeVal(attorney.phone),
    ATT_EMAIL:       safeVal(attorney.email),
    ATT_FAX:         safeVal(attorney.fax),

    // Officer Information
    IS_NEW_OFFICER: String(offence.isNewOfficer) === '1' ? 'Yes' : 'No',
    OFF_LAST_NAME:  safeVal(officer.lastName),
    OFF_FIRST_NAME: safeVal(officer.firstName),
    OFF_MIDDLE_NAME: safeVal(officer.middleName),
    OFF_TITLE:      safeVal(officer.title),
    OFF_ADDRESS1:   safeVal(officer.address1),
    OFF_ADDRESS2:   safeVal(officer.address2),
    OFF_CITY:       safeVal(officer.city),
    OFF_STATE:      safeVal(officer.state),
    OFF_ZIP:        safeVal(officer.zip),
    OFF_PHONE:      safeVal(officer.phone),
    OFF_EMAIL:      safeVal(officer.email),
    OFF_FAX:        safeVal(officer.fax),
  };

  const html = renderTemplate(template, tokens);

  // Generate PDF via shared Puppeteer browser
  const pdfTimestamp = Date.now();
  const pdfFolder = path.join(storageRoot, 'upload', 'Clerk-Docs', 'DDS-Form1', String(pdfTimestamp));
  await fs.mkdir(pdfFolder, { recursive: true });
  const pdfAbsPath = path.join(pdfFolder, `${pdfName}.pdf`);

  const page = await browser.newPage();
  try {
    // A4 content area at 96 dpi: (210mm - 2×15mm) × (96/25.4) ≈ 680px
    await page.setViewport({ width: 680, height: 900, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
    await fs.writeFile(pdfAbsPath, pdfBuffer);
  } finally {
    await page.close();
  }

  // Stage in zip folder
  await fs.copyFile(pdfAbsPath, path.join(zipFolder, `${pdfName}.pdf`));

  // Persist document record
  const attachmentPath = `/upload/Clerk-Docs/DDS-Form1/${pdfTimestamp}/${pdfName}.pdf`;
  const today = new Date().toISOString().slice(0, 10);

  const document = await DocumentsTable.create({
    caseId,
    documentType: 'OSAHForm1-initialdocs',
    dateRequested: today,
    documentName: `${pdfName}.pdf`,
    docketCaseId: caseId,
    docFileFlage: 1,
    createdBy: userId,
  });

  await AttachmentPathsModel.create({
    documentId: document.documentId,
    attachmentPath,
  });

  const dateFiled = new Date()
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');

  const description =
    `<p class="history-title">A file has been added.</p>` +
    `<p><span class="history-label">File Attachment Name:</span><span class="history-data">${pdfName}.pdf </p>` +
    `<p><span class="history-label">Document Type:</span><span class="history-data">OSAHForm1-initialdocs</p></span></p>` +
    `<p><span class="history-label">Date Filed:</span><span class="history-data">${dateFiled}</p>`;

  await History.create({
    caseId,
    docketCaseId: caseId,
    date: today,
    // Legacy's addHistory() always stamps date("H:i:s") on every history row
    // (OsahDbFunctions.php:5604) regardless of what the caller passes — match
    // that here since nothing else populates created_time (timestamps: false).
    createdTime: new Date().toTimeString().slice(0, 8),
    description,
    modifiedBy: userEmail || String(userId),
  });
};
