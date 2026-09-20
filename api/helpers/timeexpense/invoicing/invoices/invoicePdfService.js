import puppeteer from "puppeteer";

/**
 * @module
 * @author Rizwan Hiroli
 * @date 17-08-2026
 * @description
 * Renders invoice HTML (from invoicePdfTemplate.js) to a PDF buffer via
 * Puppeteer - mirrors calendarPdfService.js/pdfGenerationHelper.js's existing
 * pattern in this codebase.
 */

const PDF_MARGIN = { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" };

/**
 * @description
 * Launches a short-lived headless browser, renders the given HTML, returns the
 * PDF as a Buffer. Not for high-volume batch use (each call launches its own
 * browser) - fine for a single invoice at a time (Preview/Send), matching this
 * phase's scope.
 *
 * BUG FIX 2026-08-28: `headless: true` (Puppeteer's "new" headless mode) was
 * genuinely showing a real, visible Chromium window on this Windows dev
 * machine for the couple of seconds a render takes - confirmed directly (not
 * inferred): isolated this exact launch config with nothing else involved (no
 * app, no frontend) and had the user watch their own screen, twice, once
 * reproducing it and once confirming `headless: 'shell'` (Puppeteer's older,
 * more battle-tested headless mode) does not. Every action that renders an
 * invoice PDF server-side (View PDF, Preview PDF, Send, Resend, all of which
 * funnel through this one function) was affected identically, which is what
 * pointed here rather than at any of those callers' own, unrelated code -
 * each of them looked correct in isolation with no window.open()/blob
 * anywhere in most of them (Send/Resend have neither at all).
 * @param {*} html
 */
export const renderInvoicePdfBuffer = async (html) => {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: PDF_MARGIN });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};
