/**
 * DOCX Placeholder Extractor Utility
 * 
 * Purpose:
 * Extract template placeholders from DOCX files for validation against the field catalog
 * 
 * Implementation:
 * DOCX files are ZIP archives containing XML files.
 * Template placeholders use ${...} syntax (e.g., ${Value16}, ${noofviolations})
 * We scan document.xml, headers, and footers to find all placeholders.
 * 
 * Key Features:
 * - Handles text split across multiple Word XML runs (formatting changes)
 * - Scans main document, headers, and footers
 * - Returns exact placeholder strings including ${ and }
 * 
 * @author AI Assistant
 * @date March 16, 2026
 */

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { logger } from '../../config/winstonLogger.js';

/**
 * Extract unique template placeholders from a DOCX file
 * 
 * @param {string} filePath - Absolute path to the DOCX file
 * @returns {Promise<string[]>} - Array of unique placeholders found (e.g., ["${Value16}", "${Minors}"])
 * 
 * Placeholder format:
 * - ${FieldName} - e.g., ${Value16}, ${noofviolations}, ${Minors}
 */
export async function extractTokensFromDocx(filePath) {
  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`DOCX file not found: ${filePath}`);
    }

    // Read DOCX as ZIP archive using JSZip (handles data-descriptor ZIPs that AdmZip mishandles)
    const fileBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    const placeholdersSet = new Set();

    // XML files to scan for placeholders
    const xmlFilesToScan = [
      'word/document.xml',       // Main document body
      'word/header1.xml',        // Primary header
      'word/header2.xml',        // First page header
      'word/header3.xml',        // Even page header
      'word/footer1.xml',        // Primary footer
      'word/footer2.xml',        // First page footer
      'word/footer3.xml',        // Even page footer
    ];

    // Scan each XML file for placeholders
    for (const xmlPath of xmlFilesToScan) {
      const zipEntry = zip.file(xmlPath);

      if (zipEntry) {
        const xmlContent = await zipEntry.async('string');
        const placeholders = extractPlaceholdersFromXml(xmlContent);
        placeholders.forEach(placeholder => placeholdersSet.add(placeholder));
      }
      // Silently skip if file doesn't exist (not all docs have headers/footers)
    }

    // Convert Set to Array and sort
    return Array.from(placeholdersSet).sort();
  } catch (error) {
    logger.error(`Error extracting placeholders from DOCX: ${error.message}`);
    throw error;
  }
}

/**
 * Extract placeholders from XML content using pattern matching
 * 
 * Strategy:
 * 1. Extract all text content from <w:t> tags
 * 2. Concatenate adjacent text runs to handle Word's text splitting
 * 3. Search for ${...} placeholder patterns
 * 
 * Why concatenation is needed:
 * Word splits text across multiple <w:t> tags when formatting changes.
 * Example: "${Value16}" with bold "16" becomes:
 *   <w:t>${Value</w:t><w:t>16</w:t><w:t>}</w:t>
 * 
 * We reconstruct the full text before pattern matching.
 * 
 * @param {string} xmlContent - Raw XML content from Word document
 * @returns {string[]} - Array of unique placeholders (e.g., ["${Value16}", "${Minors}"])
 */
function extractPlaceholdersFromXml(xmlContent) {
  const placeholdersSet = new Set();

  // Step 1: Extract all text content from <w:t> tags
  // Regex: /<w:t[^>]*>([^<]+)<\/w:t>/g
  // Matches: <w:t>text</w:t> or <w:t xml:space="preserve">text</w:t>
  const textRunRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  const textFragments = [];
  let match;

  while ((match = textRunRegex.exec(xmlContent)) !== null) {
    textFragments.push(match[1]);
  }

  // Step 2: Concatenate all text fragments
  // This handles text split across multiple runs
  const fullText = textFragments.join('');

  // Step 3: Extract ${...} placeholders
  // Regex: /\$\{([^}]+)\}/g
  // Matches: ${FieldName} where FieldName can be alphanumeric, underscore, etc.
  // Captures the full placeholder including ${ and }
  const placeholderRegex = /\$\{([^}]+)\}/g;

  while ((match = placeholderRegex.exec(fullText)) !== null) {
    // match[0] is the full match: "${FieldName}"
    placeholdersSet.add(match[0]);
  }

  // Convert Set to Array and sort
  return Array.from(placeholdersSet).sort();
}

/**
 * Get temp file path from tempId
 * Follows the same pattern as preview endpoint
 * 
 * @param {string} tempId - UUID of the temp file
 * @returns {string} - Absolute path to temp DOCX file
 */
export function getTempFilePath(tempId) {
  // Temp files are stored in backend/tmp directory
  const tempDir = path.join(process.cwd(), 'tmp');
  const tempFilePath = path.join(tempDir, `${tempId}.docx`);
  
  return tempFilePath;
}

export default {
  extractTokensFromDocx,
  getTempFilePath,
};
