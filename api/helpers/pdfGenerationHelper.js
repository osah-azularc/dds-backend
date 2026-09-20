import path from 'path';
import AttorneyByCase from '../models/AttorneyByCase.js';
import AgencyCaseworkerByCase from '../models/AgencyCaseworkerByCase.js';
import MinorDetails from '../models/MinorDetails.js';
import { mysqlSequelize } from '../../connections/seqDB.js';
import { generateDocketHTML } from './pdfTemplateGenerator.js';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { logger } from "../../config/winstonLogger.js";

// Constants
const PDF_MARGIN = { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' };

/**
 * Generate docket PDF report.
 * Accepts an options object so the download helper can pass a shared Puppeteer browser
 * and pre-fetched relation data — avoiding per-case browser launches and DB queries.
 *
 * @param {String} caseId
 * @param {Object} docket
 * @param {Array}  peopleDetails
 * @param {Array}  documents
 * @param {String} caseFolder
 * @param {Object} [options]
 * @param {import('puppeteer').Browser} [options.browser]         - Shared browser (caller manages lifecycle)
 * @param {Array}  [options.attorneyDetails]                      - Pre-fetched; queried if absent
 * @param {Array}  [options.agencyCaseWorkerDetails]              - Pre-fetched; queried if absent
 * @param {Array}  [options.minorDetails]                         - Pre-fetched; queried if absent
 */
export async function generateDocketPDF(caseId, docket, peopleDetails, documents, caseFolder, options = {}) {
  const {
    browser: externalBrowser = null,
    attorneyDetails: preloadedAttorneys = null,
    agencyCaseWorkerDetails: preloadedWorkers = null,
    minorDetails: preloadedMinors = null,
  } = options;

  try {
    if (!docket) {
      return;
    }

    // Use pre-fetched data when available (batch download path); fall back to individual queries
    // (single-case callers that don't pass options).
    const needsQuery = preloadedAttorneys === null || preloadedWorkers === null || preloadedMinors === null;
    let attorneyDetails, agencyCaseWorkerDetails, minorDetails;
    if (needsQuery) {
      [attorneyDetails, agencyCaseWorkerDetails, minorDetails] = await Promise.all([
        AttorneyByCase.findAll({ where: { caseId }, raw: true }),
        AgencyCaseworkerByCase.findAll({ where: { caseId }, raw: true }),
        MinorDetails.findAll({ where: { caseId }, raw: true }),
      ]);
    } else {
      attorneyDetails = preloadedAttorneys;
      agencyCaseWorkerDetails = preloadedWorkers;
      minorDetails = preloadedMinors;
    }

    // Format docket number — mirrors PHP: parts[2]-parts[0]-parts[1]-parts[3]-parts[4]
    let updatedDocketNumber = docket.docketNumber || docket.docketnumber || '';
    if (updatedDocketNumber) {
      const parts = updatedDocketNumber.split('-');
      if (parts.length >= 5) {
        updatedDocketNumber = `${parts[2]}-${parts[0]}-${parts[1]}-${parts[3]}-${parts[4]}`;
      }
    }

    // File name convention mirrors legacy PHP: 'DOCKET REPORT_'.$caseid.'.pdf'
    const pdfPath = path.join(caseFolder, `DOCKET REPORT_${caseId}.pdf`);

    // Petitioner / respondent from peopleDetails — PHP format: "Lastname, Firstname"
    let petitionerName = '';
    let respondentName = '';

    if (peopleDetails && peopleDetails.length > 0) {
      const petitioner = peopleDetails.find(
        (p) => (p.typeOfContact || p.typeofcontact) === 'Petitioner',
      );
      const respondent = peopleDetails.find(
        (p) => (p.typeOfContact || p.typeofcontact) === 'Respondent',
      );
      if (petitioner) {
        const ln = petitioner.lastName || petitioner.Lastname || '';
        const fn = petitioner.firstName || petitioner.Firstname || '';
        petitionerName = ln && fn ? `${ln}, ${fn}` : ln || fn;
      }
      if (respondent) {
        const ln = respondent.lastName || respondent.Lastname || '';
        const fn = respondent.firstName || respondent.Firstname || '';
        respondentName = ln && fn ? `${ln}, ${fn}` : ln || fn;
      }
    }

    // Fallback: query casetypestyling using the actual caseType from docket (mirrors PHP)
    if (!petitionerName || !respondentName) {
      const caseCode = docket.caseType || docket.casetype || '';
      if (caseCode) {
        const [casetypeRow] = await mysqlSequelize.query(
          'SELECT Casetypeid, AgencyID FROM casetypes WHERE CaseCode = :caseCode LIMIT 1',
          { replacements: { caseCode }, type: mysqlSequelize.QueryTypes.SELECT },
        );
        if (casetypeRow) {
          const [stylingRow] = await mysqlSequelize.query(
            'SELECT petitioner, respondent FROM casetypestyling WHERE AgencyId = :agencyId AND Casetypeid = :caseTypeId LIMIT 1',
            {
              replacements: { agencyId: casetypeRow.AgencyID, caseTypeId: casetypeRow.Casetypeid },
              type: mysqlSequelize.QueryTypes.SELECT,
            },
          );
          if (stylingRow) {
            if (!petitionerName) petitionerName = stylingRow.petitioner || '';
            if (!respondentName) respondentName = stylingRow.respondent || '';
          }
        }
      }
    }

    // Format dates (mirrors PHP date('m-d-Y', strtotime(...)))
    const formatDate = (raw) =>
      raw && raw !== '0000-00-00'
        ? new Date(raw).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : '-';

    const daterequested = formatDate(docket.dateRequested || docket.daterequested);
    const datereceivedbyOSAH = formatDate(docket.dateReceivedByOSAH || docket.datereceivedbyosah);
    const hearingdate = formatDate(docket.hearingDate || docket.hearingdate);

    const htmlContent = generateDocketHTML({
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
    });

    // Use the shared browser when provided; otherwise launch and close one for standalone calls.
    const ownBrowser = !externalBrowser;
    let browser = externalBrowser;
    if (ownBrowser) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', margin: PDF_MARGIN, printBackground: true });
      await fs.writeFile(pdfPath, pdfBuffer);
    } finally {
      if (ownBrowser) await browser.close();
    }

  } catch (error) {
    logger.error(`[PDF] Error generating PDF for case ${caseId}: ${error.message}`);
    logger.error(error.stack);
    // Don't throw — ZIP continues even if PDF fails
  }
}
