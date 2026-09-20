/**
 * DOCX Placeholder Replacer Utility
 * 
 * Purpose:
 * Replace ${...} placeholders in DOCX files with sample values from the field catalog
 * 
 * Implementation:
 * 1. Load DOCX as ZIP archive
 * 2. Extract XML files (document.xml, headers, footers)
 * 3. For each recognized placeholder, perform text replacement
 * 4. Reconstruct DOCX with replaced values
 * 5. Write to a new temporary file (preview only)
 * 
 * Key Features:
 * - Handles text split across multiple Word XML runs (reconstructs then replaces)
 * - Processes main document, headers, and footers
 * - Preserves original temp DOCX untouched
 * - Unknown placeholders remain visible for identification
 * 
 * @author AI Assistant
 * @date March 16, 2026
 */

import JSZip from 'jszip';
import fs from 'fs';
import { replacePlaceholdersInParagraph } from './docxParagraphReplacer.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Replace placeholders in DOCX with sample values
 * 
 * @param {string} inputFilePath - Path to original temp DOCX
 * @param {Object} replacementMap - Map of placeholder to sample value (e.g., { "${Value16}": "March 15, 2026" })
 * @param {string} outputFilePath - Path for preview output DOCX
 * @returns {Promise<string>} - Path to the output file with replacements
 * 
 * Replacement Strategy:
 * - Replace recognized placeholders with their sample values
 * - Leave unknown placeholders unchanged (visible for admin review)
 * - Process all XML files: document.xml, headers, footers
 */
export async function replacePlaceholdersInDocx(inputFilePath, replacementMap, outputFilePath) {
  try {
    // Verify input file exists
    if (!inputFilePath || !fs.existsSync(inputFilePath)) {
      throw new Error(`Input DOCX file not found: ${inputFilePath}`);
    }
    
    // Validate output path
    if (!outputFilePath || typeof outputFilePath !== 'string') {
      throw new Error(`Invalid output path: ${outputFilePath}`);
    }
    
    // Validate replacement map
    if (!replacementMap || typeof replacementMap !== 'object') {
      throw new Error('Invalid replacementMap: must be an object');
    }

    // Read DOCX as ZIP archive using JSZip (handles data-descriptor ZIPs that AdmZip mishandles)
    const fileBuffer = fs.readFileSync(inputFilePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    if (!zip.files || Object.keys(zip.files).length === 0) {
      throw new Error('DOCX file appears to be empty or corrupted');
    }

    // XML files to process for placeholder replacement
    const xmlFilesToProcess = [
      'word/document.xml',       // Main document body
      'word/header1.xml',        // Primary header
      'word/header2.xml',        // First page header
      'word/header3.xml',        // Even page header
      'word/footer1.xml',        // Primary footer
      'word/footer2.xml',        // First page footer
      'word/footer3.xml',        // Even page footer
    ];

    // Process each XML file for placeholder replacement
    for (const xmlPath of xmlFilesToProcess) {
      const zipEntry = zip.file(xmlPath);

      if (zipEntry) {
        try {
          const xmlContent = await zipEntry.async('string');

          if (!xmlContent) {
            logger.warn(`Warning: ${xmlPath} has invalid content, skipping...`);
            continue;
          }

          // Replace placeholders in this XML file
          const replacedXml = replacePlaceholdersInXml(xmlContent, replacementMap, xmlPath);

          if (replacedXml === undefined || replacedXml === null) {
            throw new Error(`replacePlaceholdersInXml returned ${replacedXml} for ${xmlPath}`);
          }

          // Update the ZIP entry with replaced content
          zip.file(xmlPath, replacedXml);
        } catch (error) {
          logger.error(`Error processing ${xmlPath}: ${error.message}`);
          throw new Error(`Failed to process ${xmlPath}: ${error.message}`);
        }
      }
      // Silently skip if file doesn't exist (not all docs have headers/footers)
    }

    // Write modified DOCX to output path
    try {
      const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(outputFilePath, outputBuffer);
    } catch (zipError) {
      throw new Error(`Failed to write output DOCX: ${zipError.message}`);
    }

    // Verify output file was created
    if (!fs.existsSync(outputFilePath)) {
      throw new Error(`Output DOCX file was not created at: ${outputFilePath}`);
    }

    return outputFilePath;
  } catch (error) {
    logger.error(`Error replacing placeholders in DOCX: ${error.message}`);
    throw error;
  }
}

/**
 * Replace placeholders in XML content
 * 
 * Strategy:
 * 1. Extract all text content from <w:t> tags
 * 2. Concatenate to reconstruct full text (handles Word's splitting)
 * 3. Perform placeholder replacements in reconstructed text
 * 4. Re-inject replaced text back into XML structure
 * 
 * Challenge: Word splits text across multiple <w:t> tags, making simple find/replace fail
 * Solution: Reconstruct paragraph text, replace, then rebuild XML
 * 
 * @param {string} xmlContent - Raw XML content from Word document
 * @param {Object} replacementMap - Map of placeholder to sample value
 * @returns {string} - XML content with placeholders replaced
 */
function replacePlaceholdersInXml(xmlContent, replacementMap) {
  let xmlPartName = 'UNKNOWN_XML_PART';
  if (typeof arguments[2] === 'string' && arguments[2]) {
    xmlPartName = arguments[2];
  }

  // Validate inputs
  if (!xmlContent || typeof xmlContent !== 'string') {
    logger.warn(`replacePlaceholdersInXml received invalid xmlContent: ${typeof xmlContent}`);
    return xmlContent || '';
  }
  
  if (!replacementMap || typeof replacementMap !== 'object') {
    logger.warn(`replacePlaceholdersInXml received invalid replacementMap: ${typeof replacementMap}`);
    return xmlContent;
  }
  
  // Strategy: Process each paragraph (<w:p>) independently to preserve structure
  // Regex to match paragraphs: finds <w:p>...</w:p> blocks
  const paragraphRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  
  let replacedXml = xmlContent;
  const paragraphs = xmlContent.match(paragraphRegex);

  if (!paragraphs) {
    return xmlContent; // No paragraphs found, return unchanged
  }

  paragraphs.forEach((paragraph) => {
    const replacedParagraph = replacePlaceholdersInParagraph(paragraph, replacementMap);
    const wasSkipped = replacedParagraph === undefined || replacedParagraph === null;
    if (!wasSkipped) {
      replacedXml = replacedXml.replace(paragraph, replacedParagraph);
    }
  });

  // Targeted fallback: only for surviving Value19 in word/document.xml.
  // Replace text content inside <w:t ...> nodes only, preserving tags/attributes/VML structure.
  if (xmlPartName === 'word/document.xml' && replacedXml.includes('${Value19}')) {
    const fallbackResult = applyTargetedTextNodeFallbackForValue19(replacedXml, replacementMap);
    replacedXml = fallbackResult.xml;
  }

  // Targeted fallback: only for surviving Values2 in word/document.xml.
  // Replace text content inside <w:t ...> nodes only, preserving tags/attributes/VML structure.
  if (xmlPartName === 'word/document.xml' && replacedXml.includes('${Values2}')) {
    const fallbackResult = applyTargetedTextNodeFallbackForValues2(replacedXml, replacementMap);
    replacedXml = fallbackResult.xml;
  }

  return replacedXml;
}

function applyTargetedTextNodeFallbackForValue19(xmlContent, replacementMap) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    return { xml: xmlContent || '', applied: false, nodesUpdated: 0 };
  }

  const value19Replacement = replacementMap?.['${Value19}'];
  if (value19Replacement === undefined || value19Replacement === null) {
    return { xml: xmlContent, applied: false, nodesUpdated: 0 };
  }

  let nodesUpdated = 0;
  const updatedXml = xmlContent.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (fullMatch, openTag, textContent, closeTag) => {
    if (!textContent || !textContent.includes('${Value19}')) {
      return fullMatch;
    }

    let replacedText = textContent;
    for (const [placeholder, sampleValue] of Object.entries(replacementMap)) {
      if (replacedText.includes(placeholder)) {
        replacedText = replacedText.split(placeholder).join(sampleValue || '');
      }
    }

    if (replacedText === textContent) {
      return fullMatch;
    }

    nodesUpdated += 1;
    return `${openTag}${escapeXml(replacedText)}${closeTag}`;
  });

  return {
    xml: updatedXml,
    applied: nodesUpdated > 0,
    nodesUpdated,
  };
}

function applyTargetedTextNodeFallbackForValues2(xmlContent, replacementMap) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    return { xml: xmlContent || '', applied: false, nodesUpdated: 0 };
  }

  const values2Replacement = replacementMap?.['${Values2}'];
  if (values2Replacement === undefined || values2Replacement === null) {
    return { xml: xmlContent, applied: false, nodesUpdated: 0 };
  }

  let nodesUpdated = 0;
  const updatedXml = xmlContent.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (fullMatch, openTag, textContent, closeTag) => {
    if (!textContent || !textContent.includes('${Values2}')) {
      return fullMatch;
    }

    const replacedText = textContent.split('${Values2}').join(String(values2Replacement));
    if (replacedText === textContent) {
      return fullMatch;
    }

    nodesUpdated += 1;
    return `${openTag}${escapeXml(replacedText)}${closeTag}`;
  });

  return {
    xml: updatedXml,
    applied: nodesUpdated > 0,
    nodesUpdated,
  };
}

/**
 * Escape XML special characters
 * 
 * @param {string} text - Text to escape
 * @returns {string} - XML-safe text
 */
function escapeXml(text) {
  if (text === undefined || text === null) {
    return '';
  }
  
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default {
  replacePlaceholdersInDocx,
};
