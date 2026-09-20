import { generatePersonSection, generateAttorneySection } from './pdfSectionGenerators.js';
import {
  generateAgencyCaseWorkerSection,
  generateMinorSection,
} from './pdfSectionGenerators2.js';
import { escapeHtml } from '../utilities/htmlEscape.js';

/**
 * Generate docket HTML for PDF
 * @param {Object} data - Data for PDF generation
 * @returns {String} - HTML content
 */
export function generateDocketHTML(data) {
  const {
    caseId,
    updatedDocketNumber,
    petitionerName,
    respondentName,
    docket,
    daterequested,
    datereceivedbyOSAH,
    hearingdate,
    peopleDetails,
    attorneyDetails,
    agencyCaseWorkerDetails,
    minorDetails,
    documents,
  } = data;

  // Generate documents table HTML
  const docTableHtml = generateDocumentsTable(documents);

  // Generate people details HTML
  const peopleHtml = generatePeopleDetailsHTML(peopleDetails, docket);

  // Generate attorney details HTML
  const attorneyHtml = generateAttorneyDetailsHTML(attorneyDetails);

  // Generate agency case worker HTML
  const agencyCaseWorkerHtml = generateAgencyCaseWorkerHTML(agencyCaseWorkerDetails);

  // Generate minor details HTML
  const minorHtml = generateMinorDetailsHTML(minorDetails);

  // Build complete HTML — structure mirrors PHP generatePdfReport()
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(`DOCKET REPORT_${caseId}`)}</title>
    </head>
    <body>
        <div style="margin: 0 auto; width: 1024px; display: table;">
            <div style="display: table; width: 100%;">
                <div style="width: 25%; float: left;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0; display: table; width: 100%;">Docket Number</span>
                        <h3 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; display: table; width: 100%; padding: 0;">${escapeHtml(updatedDocketNumber)}</h3>
                    </div>
                </div>
                <div style="width: 25%; float: left;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0; display: table; width: 100%;">Petitioner</span>
                        <h3 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; display: table; width: 100%; padding: 0;">${escapeHtml(petitionerName)}</h3>
                    </div>
                </div>
                <div style="width: 25%; float: left;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0; display: table; width: 100%;">Respondent</span>
                        <h3 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; display: table; width: 100%; padding: 0;">${escapeHtml(respondentName)}</h3>
                    </div>
                </div>
                <div style="width: 25%; float: left;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0; display: table; width: 100%;">Created By:</span>
                        <h3 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0 0 10px 0; display: table; width: 100%; padding: 0;">${escapeHtml(docket.docketClerk || docket.docketclerk || '')}</h3>
                    </div>
                </div>
            </div>
            <hr/>
            <div style="margin: 0 0 20px 0; display: table; width: 100%;">
                <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 10px 0 5px 0; padding: 0 5px; display: table; width: 100%;">Docket Information</h3>
                <div style="display: table; width: 100%; margin: 0;">
                    <div style="float: left; width: 20%; margin: 0 30px 0 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; width: 100%;">Agency Code</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.refAgency || docket.refagency || '')}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 20%; margin: 0 30px 0 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Case Type</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.caseType || docket.casetype || '')}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 20%; margin: 0 30px 0 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">County</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.county || '')}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 20%; margin: 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Status</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.status || '')}</h4>
                        </div>
                    </div>
                </div>
            </div>
            <hr/>
            <div>
                <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 10px 0 5px 0; padding: 0 5px; display: table; width: 100%;">Additional Information</h3>
                <div style="display: table; width: 100%; margin: 0;">
                    <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Date Requested</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${daterequested}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Date Received</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${datereceivedbyOSAH}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Agency Reference Number</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.agencyRefNumber || docket.agencyrefnumber || '')}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Hearing Type</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(docket.hearingMode || docket.hearingmode || '-')}</h4>
                        </div>
                    </div>
                    <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                        <div style="padding: 0 5px;">
                            <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Hearing Date</span>
                            <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${hearingdate}</h4>
                        </div>
                    </div>
                </div>
            </div>
            <hr/>
            <div>
                ${peopleHtml}
            </div>
            <div>
                ${attorneyHtml}
            </div>
            ${agencyCaseWorkerHtml}
            ${minorHtml}
            ${docTableHtml}
        </div>
    </body>
    </html>
  `;
}

/**
 * Generate documents table HTML
 * @param {Array} documents - Documents array
 * @returns {String} - HTML content
 */
function generateDocumentsTable(documents) {
  if (!documents || documents.length === 0) {
    return '';
  }

  let docTableHtml = `
    <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 10px 0 5px 0; padding: 0 5px; display: table; width: 100%;">Documents Information</h3>
    <div style="display: table; width: 100%; margin: 0;">
        <div style="padding-top: 5px;">
            <table style="font-family: arial, sans-serif; border-collapse: collapse; width: 100%;">
                <tr>
                    <th style="font-family: arial, sans-serif; border-collapse: collapse; width: 25%;">Document</th>
                    <th style="font-family: arial, sans-serif; border-collapse: collapse; width: 25%;">Name</th>
                    <th style="font-family: arial, sans-serif; border-collapse: collapse; width: 25%;">Date</th>
                    <th style="font-family: arial, sans-serif; border-collapse: collapse; width: 25%;">Description</th>
                </tr>`;

  documents.forEach((doc) => {
    // Support both Sequelize model instances (camelCase) and raw query results (PascalCase)
    const dateRequested = doc.dateRequested || doc.DateRequested;
    const documentType  = doc.documentType  || doc.DocumentType;
    const documentName  = doc.documentName  || doc.DocumentName;
    const description   = doc.description   || doc.Description;

    const docDate =
      dateRequested && dateRequested !== '0000-00-00'
        ? new Date(dateRequested).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })
        : '-';
    docTableHtml += `
                <tr>
                    <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${escapeHtml(documentType || '')}</td>
                    <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${escapeHtml(documentName || '')}</td>
                    <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${docDate}</td>
                    <td style="border: 1px solid #dddddd; text-align: left; padding: 8px;">${escapeHtml(description || '')}</td>
                </tr>`;
  });

  docTableHtml += `
            </table>
        </div>
    </div>`;

  return docTableHtml;
}

/**
 * Generate people details HTML
 * @param {Array} peopleDetails - People details array
 * @param {Object} docket - Docket object
 * @returns {String} - HTML content
 */
function generatePeopleDetailsHTML(peopleDetails, docket) {
  if (!peopleDetails || peopleDetails.length === 0) {
    return '';
  }

  let peopleHtml = '';
  peopleDetails.forEach((person) => {
    // PeopleDetails.findAll({ raw: true }) returns Sequelize attribute names (camelCase)
    const contactType = person.typeOfContact || person.typeofcontact || '';
    let sectionTitle = '';
    switch (contactType) {
      case 'Petitioner':
        sectionTitle = 'Petitioner Information';
        break;
      case 'Respondent':
        sectionTitle = 'Respondent';
        break;
      case 'CPAFirm':
        sectionTitle = 'CPAFirm';
        break;
      case 'Custodial Parent':
        sectionTitle = 'Custodial Parent';
        break;
      case 'Representative':
        sectionTitle = 'Representative';
        break;
      case 'Head of Household':
        sectionTitle = 'Head of Household';
        break;
      default:
        sectionTitle = contactType;
    }

    if (sectionTitle) {
      // Licence Number only shown for ALS case type (mirrors PHP $licenceNum logic)
      const caseType = docket.caseType || docket.casetype || '';
      const licenceNum = caseType === 'ALS' ? (docket.agencyRefNumber || docket.agencyrefnumber || '') : '';
      peopleHtml += generatePersonSection(sectionTitle, person, licenceNum);
    }
  });

  return peopleHtml;
}

/**
 * Generate attorney details HTML
 * @param {Array} attorneyDetails - Attorney details array
 * @returns {String} - HTML content
 */
function generateAttorneyDetailsHTML(attorneyDetails) {
  if (!attorneyDetails || attorneyDetails.length === 0) {
    return '';
  }

  let attorneyHtml = '';
  attorneyDetails.forEach((attorney) => {
    // AttorneyByCase.findAll({ raw: true }) returns Sequelize attribute names (camelCase)
    const contactType = attorney.typeOfContact || attorney.typeofcontact || '';
    let sectionTitle = '';
    switch (contactType) {
      case 'Petitioner Attorney':
        sectionTitle = 'Petitioner Attorney';
        break;
      case 'District Attorney':
        sectionTitle = 'District Attorney';
        break;
      case 'Other Attorney':
        sectionTitle = 'Other Attorney';
        break;
      case 'Intervenor Attorney':
        sectionTitle = 'Intervenor Attorney';
        break;
      case 'Respondent Attorney':
        sectionTitle = 'Respondent Attorney';
        break;
      case 'Officer':
        sectionTitle = 'Officer';
        break;
      case 'Agency Attorney':
        sectionTitle = 'Agency Attorney';
        break;
      default:
        sectionTitle = contactType;
    }

    if (sectionTitle) {
      attorneyHtml += generateAttorneySection(sectionTitle, attorney);
    }
  });

  return attorneyHtml;
}

/**
 * Generate agency case worker HTML
 * @param {Array} agencyCaseWorkerDetails - Agency case worker details array
 * @returns {String} - HTML content
 */
function generateAgencyCaseWorkerHTML(agencyCaseWorkerDetails) {
  if (!agencyCaseWorkerDetails || agencyCaseWorkerDetails.length === 0) {
    return '';
  }

  let agencyCaseWorkerHtml = '';
  agencyCaseWorkerDetails.forEach((worker) => {
    // Use typeofcontact as section title (mirrors PHP switch)
    const contactType = worker.typeOfContact || worker.typeofcontact || '';
    const validTypes = [
      'Officer', 'Agency Contact', 'Administrator', 'Candidate', 'Case Worker',
      'County Director', 'Supervisor', 'School District', 'Probate Judge', 'Officer1',
      'Investigator', 'Intervenor', 'Employer', 'Hearing Coordinator',
    ];
    const sectionTitle = validTypes.includes(contactType) ? contactType : contactType;
    if (sectionTitle) {
      agencyCaseWorkerHtml += generateAgencyCaseWorkerSection(sectionTitle, worker);
    }
  });

  return agencyCaseWorkerHtml;
}

/**
 * Generate minor details HTML
 * @param {Array} minorDetails - Minor details array
 * @returns {String} - HTML content
 */
function generateMinorDetailsHTML(minorDetails) {
  if (!minorDetails || minorDetails.length === 0) {
    return '';
  }

  let minorHtml = '';
  minorDetails.forEach((minor) => {
    minorHtml += generateMinorSection(minor);
  });

  return minorHtml;
}

