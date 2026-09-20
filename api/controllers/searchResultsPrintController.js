import path from 'node:path';
import os from 'node:os';
import fsPromises from 'node:fs/promises';
import archiver from 'archiver';
import { generateCalendarPDFs } from '../helpers/calendarPdfService.js';
import { logger } from "../../config/winstonLogger.js";

/**
 * Build a ZIP in memory from an array of file paths (no subfolder — files at root).
 * Mirrors PHP: $zip->addFile($node, basename($node))
 */
function zipFilesToBuffer(filePaths) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    filePaths.forEach((fp) => {
      archive.file(fp, { name: path.basename(fp) });
    });

    archive.finalize();
  });
}

/**
 * Print result — generates Calendar PDFs for the judge/date from the posted condition
 * and returns them inside a ZIP, mirroring the legacy PHP printresultAction.
 *
 * PHP equivalent:
 *   $condition = json_decode($_POST['condition'], true);
 *   $judge     = $condition['judge'];
 *   $hearingdate = $condition['calendarhearingdate'];
 *   header('Content-Disposition: attachment; filename="'.$judge.time().'_Calendar.zip"');
 *
 * ZIP name  : [judge][unix_timestamp]_Calendar.zip
 * PDF names : [judge]_Calendar_[index].pdf
 *
 * @route POST /search-results/print
 * @body  { condition: { judge: string, calendarhearingdate: string } }
 * @returns {File} ZIP containing the generated Calendar PDF(s)
 */
export const printResultAction = async (req, res) => {
  let tmpDir = null;
  try {
    // 1. Extract judge + hearingdate from the posted condition — mirrors PHP exactly.
    //    PHP key: 'calendarhearingdate'; React key: 'hearingDateFrom'
    const condition = req.body?.condition || {};
    const judge = condition.judge;
    const rawDate = condition.calendarhearingdate || condition.hearingDateFrom;
    const hearingDate = rawDate ? String(rawDate).substring(0, 10) : null;

    // Validate judge: must be a non-empty string within a reasonable length.
    if (!judge || typeof judge !== 'string' || !judge.trim() || judge.length > 100) {
      return res.status(400).json({
        result: false,
        message: 'Missing or invalid judge name',
      });
    }

    // Validate hearingDate: must be present and match YYYY-MM-DD exactly.
    if (!hearingDate || !/^\d{4}-\d{2}-\d{2}$/.test(hearingDate)) {
      return res.status(400).json({
        result: false,
        message: 'Invalid or missing hearing date. Expected format: YYYY-MM-DD',
      });
    }

    // 2. Generate Calendar PDFs into a temp directory
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'calendar-'));
    const pdfPaths = await generateCalendarPDFs(judge, hearingDate, tmpDir);

    if (!pdfPaths.length) {
      return res.status(404).json({
        result: false,
        message: 'No hearing records found for this judge and date',
      });
    }

    // 3. Zip all PDFs (files at root, no subfolder) — mirrors PHP ZipArchive::addFile
    const zipBuffer = await zipFilesToBuffer(pdfPaths);

    // 4. ZIP filename: [JudgeName][timestamp]_Calendar.zip  (mirrors PHP header)
    const timestamp = Math.floor(Date.now() / 1000);
    // Strip characters that can break HTTP header parsing or enable header injection.
    const safeJudge = judge.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
    const zipFileName = `${safeJudge}${timestamp}_Calendar.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (error) {
    logger.error('printResultAction failed:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal Server Error',
      });
    }
  } finally {
    // Clean up temp directory
    if (tmpDir) {
      fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
};

