import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { Op, fn, col, where as sequelizeWhere } from 'sequelize';
import Docket from '../../models/Docket.js';
import CaseTypeStyling from '../../models/admin/caseTypeStylingModel.js';
import Form1205Offence from '../../models/Form1205Offence.js';
import PermitEligibilityEffectivedate from '../../models/PermitEligibilityEffectivedate.js';
import AgencyCaseworkerByCase from '../../models/AgencyCaseworkerByCase.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import DriverRequest from '../../models/DriverRequest.js';
import Casetypes from '../../models/Casetypes.js';
import { logger } from '../../../config/winstonLogger.js';
import { getStorageRoot, TEMPLATE_PATH } from './printForm1Helpers.js';
import { processCase } from './printForm1CaseProcessor.js';

/**
 * Form 1 (DDS Form) Print Service
 * Legacy: OsahformController::printosahformAction() + printpdfmultipletimes()
 *
 * Queries open ALS cases, renders each as an inline-styled HTML page,
 * converts to PDF with Puppeteer, stores in DB, and stages all PDFs
 * in a timestamped zip folder for the download endpoint.
 *
 * Only ALS is supported today (hardcoded below) — if/when other case types
 * need this same print pipeline, `docketWhere.caseType` is the place to
 * parameterize.
 */

const fetchDefaultForm1Names = async () => {
  const casetypeRow = await Casetypes.findOne({
    where: { caseCode: 'ALS' },
    attributes: ['caseTypeId', 'agencyId'],
  });
  if (!casetypeRow) return { petitioner: '-', respondent: '-' };

  const stylingRow = await CaseTypeStyling.findOne({
    where: { AgencyID: casetypeRow.agencyId, Casetypeid: casetypeRow.caseTypeId },
    attributes: ['petitioner', 'respondent'],
  });
  return stylingRow || { petitioner: '-', respondent: '-' };
};

const removeOldZipFolders = async (zipRoot, days = 3) => {
  try {
    if (!fsSync.existsSync(zipRoot)) return;
    const threshold = days * 24 * 60 * 60 * 1000;
    const items = await fs.readdir(zipRoot);
    for (const item of items) {
      const itemPath = path.join(zipRoot, item);
      const stats = await fs.stat(itemPath).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs > threshold) {
        await fs.rm(itemPath, { recursive: true, force: true });
      }
    }
  } catch (err) {
    logger.warn('Print Form1: zip folder cleanup failed', { error: err.message });
  }
};

/**
 * Join the dockets against their related rows in-memory and produce one entry
 * per (case, officer-contact-row) pair — mirroring the legacy SQL join fan-out.
 *
 * Legacy: LEFT JOIN agencycaseworkerbycase (filtered to 'Officer' in WHERE), so
 * a case with multiple 'Officer' rows produced multiple result rows; and an
 * INNER JOIN on driverrequest, which silently excluded cases with no matching
 * driver_request row. Both behaviors are preserved here.
 *
 * @returns {Array<Object>} One entry per printable (case, officer) pair
 */
const buildPrintableCases = (dockets, offences, officers, permits, attorneys, driverRequests) => {
  const offenceMap  = new Map(offences.map((o) => [String(o.caseId), o]));
  const permitMap   = new Map(permits.map((p) => [String(p.caseId), p]));
  const attorneyMap = new Map(attorneys.map((a) => [String(a.caseId), a]));
  const driverRequestMap = new Map(driverRequests.map((d) => [String(d.id), d]));

  const officersByCase = new Map();
  for (const o of officers) {
    const key = String(o.caseId);
    if (!officersByCase.has(key)) officersByCase.set(key, []);
    officersByCase.get(key).push(o);
  }

  const results = [];
  for (const docket of dockets) {
    const key = String(docket.caseId);
    const offence = offenceMap.get(key);
    const officerRows = officersByCase.get(key);
    if (!offence || !officerRows) continue;

    const driverReq = driverRequestMap.get(String(offence.driverRequest));
    if (!driverReq) continue;

    for (const officer of officerRows) {
      results.push({
        docket,
        offence,
        officer,
        permit:   permitMap.get(key)   || {},
        attorney: attorneyMap.get(key) || {},
        driverReq,
      });
    }
  }
  return results;
};

/**
 * Generate DDS Form 1 PDFs for all open ALS cases matching the given filters,
 * stage them in a shared zip folder, and return the folder's timestamp ID.
 *
 * @param {Object} params
 * @param {string} [params.datereceivedbyOSAH]
 * @param {string} [params.refagency]
 * @param {string|number} [params.caseid]
 * @param {number} userId
 * @param {string} userEmail
 * @returns {Promise<number|null>} Zip folder timestamp, or null when no cases match
 */
export const printForm1 = async (params = {}, userId, userEmail) => {
  const storageRoot = getStorageRoot();
  const zipRoot = path.join(storageRoot, 'upload', 'zip_folder');
  await removeOldZipFolders(zipRoot);

  const andConditions = [
    { caseType: 'ALS' },
    { status: { [Op.ne]: 'Closed' } },
  ];
  if (params.datereceivedbyOSAH) {
    // dateReceivedByOSAH is modeled as DataTypes.DATE, so a plain 'YYYY-MM-DD'
    // string gets parsed as a JS Date and re-serialized in the server's local
    // timezone, which can shift it off midnight and break an exact match
    // against a date-only stored value. Compare via MySQL's DATE() on the
    // column instead, so the input string is never routed through JS Date
    // parsing/timezone conversion at all.
    andConditions.push(sequelizeWhere(fn('DATE', col('datereceivedbyOSAH')), params.datereceivedbyOSAH));
  }
  if (params.refagency) andConditions.push({ refAgency: params.refagency });
  if (params.caseid) andConditions.push({ caseId: Number(params.caseid) });
  if (params.docketnumber) andConditions.push({ docketNumber: params.docketnumber });

  const docketWhere = { [Op.and]: andConditions };

  const dockets = await Docket.findAll({ where: docketWhere, raw: true });
  if (!dockets.length) return null;

  const docketCaseIds = dockets.map((d) => d.caseId);

  const [offences, officers, permits, attorneys] = await Promise.all([
    Form1205Offence.findAll({ where: { caseId: { [Op.in]: docketCaseIds } }, raw: true }),
    AgencyCaseworkerByCase.findAll({
      where: { caseId: { [Op.in]: docketCaseIds }, typeOfContact: 'Officer' },
      raw: true,
    }),
    PermitEligibilityEffectivedate.findAll({ where: { caseId: { [Op.in]: docketCaseIds } }, raw: true }),
    AttorneyByCase.findAll({
      where: { caseId: { [Op.in]: docketCaseIds }, typeOfContact: 'Petitioner Attorney' },
      raw: true,
    }),
  ]);

  const driverRequestIds = [...new Set(offences.map((o) => o.driverRequest).filter(Boolean))];
  const driverRequests = driverRequestIds.length
    ? await DriverRequest.findAll({ where: { id: { [Op.in]: driverRequestIds } }, raw: true })
    : [];

  const results = buildPrintableCases(dockets, offences, officers, permits, attorneys, driverRequests);
  if (!results.length) return null;

  const defaultNames = await fetchDefaultForm1Names();

  const timestamp = Date.now();
  const zipFolder = path.join(zipRoot, String(timestamp));
  await fs.mkdir(zipFolder, { recursive: true });

  // Read the HTML template once for the entire batch
  const template = await fs.readFile(TEMPLATE_PATH, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const caseData of results) {
      try {
        await processCase({ caseData, template, zipFolder, defaultNames, userId, userEmail, browser });
      } catch (err) {
        logger.error(`Print Form1: failed for case ${caseData.docket.caseId}`, {
          error: err.message,
          stack: err.stack,
        });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return timestamp;
};
