/**
 * DOCX Paragraph Replacer
 *
 * Handles per-paragraph placeholder replacement for Word XML content.
 * Moved from docxPlaceholderReplacer.js (Split 1).
 * escapeXml is copied here to keep this module self-contained (no cross-import).
 */

import { logger } from '../../config/winstonLogger.js';

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

/**
 * Replace placeholders within a single paragraph
 *
 * ROBUST STRATEGY for complex DOCX structures:
 * 1. FIRST: Process textbox content (<w:txbxContent>) inside VML structures
 *    - Textboxes are nested inside picture runs
 *    - Recursively process textbox paragraphs to handle placeholders
 * 2. Extract all <w:r> runs from the OUTER paragraph
 * 3. Identify consecutive text runs (excluding picture runs)
 * 4. Group consecutive text runs into "segments"
 * 5. For each segment:
 *    - Concatenate all text to reconstruct full content
 *    - Check for placeholders (handles split placeholders across runs)
 *    - If found, replace in concatenated text
 *    - Inject replaced text into FIRST text run of segment
 *    - Remove OTHER text runs in segment to avoid duplication
 * 6. Preserve ALL non-text runs (images, pictures, bookmarks, form fields, tabs, etc.)
 *
 * This handles edge cases like:
 * - Placeholders inside textboxes (VML <w:txbxContent>)
 * - Placeholders split across multiple <w:t> elements
 * - Paragraphs with picture runs followed by text runs
 * - Form fields and structured document tags
 * - Complex formatting with multiple runs
 *
 * @param {string} paragraphXml - XML content of a single <w:p> paragraph
 * @param {Object} replacementMap - Map of placeholder to sample value
 * @returns {string} - Paragraph XML with replacements
 */


function replacePlaceholdersInParagraph(paragraphXml, replacementMap) {
  // Validate inputs
  if (!paragraphXml || typeof paragraphXml !== 'string') {
    logger.warn('[Replacer] Invalid paragraphXml received');
    return paragraphXml || '';
  }

  // STEP 1: Process textbox content inside VML structures FIRST
  // This handles placeholders in <w:txbxContent> (textboxes inside pictures/shapes)
  // We do this before segment grouping to avoid interference
  let processedXml = paragraphXml;
  const txbxRegex = /<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g;
  const textboxes = paragraphXml.match(txbxRegex);

  if (textboxes) {
    textboxes.forEach((textbox) => {
      // Recursively process textbox paragraphs (textboxes contain <w:p> elements)
      const txbxParagraphRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
      const txbxParagraphs = textbox.match(txbxParagraphRegex);

      if (txbxParagraphs) {
        let replacedTextbox = textbox;
        txbxParagraphs.forEach((txbxPara) => {
          // Recursively process each textbox paragraph
          const replacedTxbxPara = replacePlaceholdersInParagraph(txbxPara, replacementMap);
          replacedTextbox = replacedTextbox.replace(txbxPara, replacedTxbxPara);
        });
        processedXml = processedXml.replace(textbox, replacedTextbox);
      }
    });
  }

  // STEP 2: Mask textbox content for OUTER run segmentation only.
  // Nested <w:r>/<w:t> inside <w:txbxContent> can break outer run regex matching.
  // We restore these blocks unchanged after outer paragraph processing.
  const txbxBlocks = [];
  const segmentationXml = processedXml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, (block) => {
    const token = `__TXBX_BLOCK_${txbxBlocks.length}__`;
    txbxBlocks.push(block);
    return token;
  });

  // Extract all <w:r> runs from the OUTER paragraph
  const runRegex = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  const runs = segmentationXml.match(runRegex);

  if (!runs || runs.length === 0) {
    return processedXml; // No runs, return with textbox replacements applied
  }

  // STEP 3: Build segments of consecutive text runs
  // KEY FIX: Treat picture runs as non-text boundaries
  const segments = [];
  let currentSegment = [];

  runs.forEach((run, index) => {
    const hasText = /<w:t[^>]*>/.test(run);
    const hasPict = /<w:pict>/.test(run);

    // Only treat as text run if it has <w:t> AND is not a picture run
    // Picture runs (even with nested textbox <w:t>) are non-text for outer paragraph
    if (hasText && !hasPict) {
      // This is a real text run (not a picture), add to current segment
      currentSegment.push({ run, index, hasText: true });
    } else {
      // Non-text run (image, bookmark, tab, picture, etc.)
      // Close current segment if any
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      // Add non-text run as its own segment
      segments.push([{ run, index, hasText: false }]);
    }
  });

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  // Process each segment
  const processedRuns = [...runs];

  segments.forEach(segment => {
    // Skip non-text segments (preserve them as-is)
    if (segment.length === 1 && !segment[0].hasText) {
      return;
    }

    // Text segment - concatenate all text
    const textFragments = [];
    segment.forEach(({ run }) => {
      const textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      textMatches.forEach(match => {
        const content = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
        if (content && content[1]) {
          textFragments.push(content[1]);
        }
      });
    });

    const fullText = textFragments.join('');

    // Check if this segment contains any placeholders
    let hasPlaceholders = false;
    for (const placeholder in replacementMap) {
      if (fullText.includes(placeholder)) {
        hasPlaceholders = true;
      }
    }

    if (!hasPlaceholders) {
      return; // No placeholders in this segment, leave unchanged
    }

    // Perform replacements
    let replacedText = fullText;
    for (const [placeholder, sampleValue] of Object.entries(replacementMap)) {
      if (fullText.includes(placeholder)) {
        replacedText = replacedText.split(placeholder).join(sampleValue || '');
      }
    }

    // Find first text run in segment
    const firstRunIndex = segment[0].index;
    const firstRun = segment[0].run;

    // Check if first run actually has <w:t>
    if (!/<w:t[^>]*>/.test(firstRun)) {
      logger.warn('[Replacer] First run has no <w:t>, cannot replace');
      return;
    }

    // Replace text in first run with the full replaced text
    const escapedText = escapeXml(replacedText);
    const modifiedFirstRun = firstRun.replace(
      /<w:t[^>]*>[^<]*<\/w:t>/,
      `<w:t xml:space="preserve">${escapedText}</w:t>`
    );

    processedRuns[firstRunIndex] = modifiedFirstRun;

    // Remove text content from other runs in segment (keep the runs but empty their <w:t>)
    for (let i = 1; i < segment.length; i++) {
      const runIndex = segment[i].index;
      // Replace <w:t> elements with empty text
      processedRuns[runIndex] = processedRuns[runIndex].replace(
        /<w:t[^>]*>[^<]*<\/w:t>/g,
        '<w:t></w:t>'
      );
    }
  });

  // Rebuild paragraph with processed runs on segmentation XML,
  // then restore original textbox blocks.
  let result = segmentationXml;
  runs.forEach((originalRun, index) => {
    if (processedRuns[index] !== originalRun) {
      result = result.replace(originalRun, processedRuns[index]);
    }
  });

  txbxBlocks.forEach((block, index) => {
    result = result.replace(`__TXBX_BLOCK_${index}__`, block);
  });

  return result;
}

export { replacePlaceholdersInParagraph };
