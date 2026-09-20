import path from 'node:path';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { fetchCalendarGroups } from './calendarRepository.js';
import { buildCalendarHtml, formatDate, formatTime } from './calendarHtmlBuilder.js';

/** Puppeteer page margin applied to every generated calendar PDF page. */
const PDF_MARGIN = { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' };

/**
 * Generate one PDF per hearing-time group and write them to outputDir.
 * File names: [judgeName]_Calendar_[index].pdf  (mirrors PHP)
 *
 * @param {string} judgeName   - Full judge name (e.g. "Shrawane Amol")
 * @param {string} hearingDate - ISO date string (e.g. "2025-01-15")
 * @param {string} outputDir   - Absolute path to write PDFs into
 * @returns {Promise<string[]>} - Array of written PDF file paths
 */
export async function generateCalendarPDFs(judgeName, hearingDate, outputDir) {
  // Build "Lastname, Remainder" for the header (mirrors PHP arr_judge logic).
  // Use slice(1).join(' ') so middle names and suffixes are preserved:
  //   "Barnes Shakara M." → "Barnes, Shakara M."  (was truncated to "Barnes, Shakara")
  //   "Malihi Michael"    → "Malihi, Michael"
  //   "Smith"             → "Smith"  (single-token fallback)
  const parts = judgeName.trim().split(/\s+/);
  const judgeNameFormatted =
    parts.length >= 2 ? `${parts[0]}, ${parts.slice(1).join(' ')}` : judgeName;

  const groups = await fetchCalendarGroups(judgeName, hearingDate);
  const formattedDate = formatDate(hearingDate);

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // Generate all PDFs in parallel — each group gets its own Puppeteer page so
    // they render concurrently rather than sequentially.
    const writtenPaths = await Promise.all(
      groups.map(async (group, i) => {
        const pdfFileName = `${judgeName}_Calendar_${i + 1}.pdf`;
        const html = await buildCalendarHtml({
          judgeName: judgeNameFormatted,
          county: group.county,
          hearingSite: group.hearingSite,
          hearingDate: formattedDate,
          hearingTime: formatTime(group.hearingTime),
          rows: group.cases,
          pdfTitle: pdfFileName,
        });

        const pdfPath = path.join(outputDir, pdfFileName);

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          landscape: true,
          margin: PDF_MARGIN,
          printBackground: true,
        });
        await page.close();

        await fs.writeFile(pdfPath, pdfBuffer);
        return pdfPath;
      }),
    );
    return writtenPaths;
  } finally {
    await browser.close();
  }
}

