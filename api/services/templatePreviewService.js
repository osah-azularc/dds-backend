/**
 * Template Preview Service with Sample Value Injection
 * 
 * Purpose:
 * Generate preview versions of templates with sample values from the catalog
 * 
 * Flow:
 * 1. Load temp DOCX file
 * 2. Scan for placeholders
 * 3. Match against catalog
 * 4. Replace recognized placeholders with sample values
 * 5. Create preview DOCX (separate from original)
 * 6. Return preview file path
 * 
 * @author AI Assistant
 * @date March 16, 2026
 */

import { matchTokensAgainstCatalog } from './templateFieldMatcher.js';
import { extractTokensFromDocx } from '../utilities/docxTokenExtractor.js';
import { replacePlaceholdersInDocx } from '../utilities/docxPlaceholderReplacer.js';
import fs from 'fs';
import path from 'path';
import { logger } from "../../config/winstonLogger.js";

/**
 * Generate preview DOCX with sample values injected
 * 
 * @param {string} tempFilePath - Path to original temp DOCX
 * @param {string} previewFilePath - Path for preview output DOCX
 * @param {string} templateFamily - Template family (default: 'legacy_core')
 * @returns {Promise<Object>} - Preview metadata with file path and replacement summary
 * 
 * Returns:
 * {
 *   previewFilePath: "/path/to/preview.docx",
 *   placeholdersReplaced: 5,
 *   unknownPlaceholders: 2,
 *   replacements: [
 *     { placeholder: "${Value16}", sampleValue: "March 15, 2026" }
 *   ]
 * }
 */
export async function generatePreviewWithSampleValues(
  tempFilePath,
  previewFilePath,
  templateFamily = 'legacy_core'
) {
  try {
    // Validate inputs
    if (!tempFilePath || typeof tempFilePath !== 'string') {
      throw new Error('Invalid tempFilePath provided');
    }
    
    if (!previewFilePath || typeof previewFilePath !== 'string') {
      throw new Error('Invalid previewFilePath provided');
    }
    
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`Temp file does not exist: ${tempFilePath}`);
    }
    
    // Step 1: Extract placeholders from temp DOCX
    const detectedPlaceholders = await extractTokensFromDocx(tempFilePath);

    if (!detectedPlaceholders || detectedPlaceholders.length === 0) {
      // No placeholders found - just copy the file as-is
      fs.copyFileSync(tempFilePath, previewFilePath);
      return {
        previewFilePath,
        placeholdersReplaced: 0,
        unknownPlaceholders: 0,
        replacements: [],
      };
    }

    // Step 2: Match placeholders against catalog to get sample values
    const matchResult = await matchTokensAgainstCatalog(detectedPlaceholders, templateFamily);

    // Step 3: Build replacement map: placeholder -> sample value
    const replacementMap = {};
    const replacements = [];

    matchResult.recognizedFields.forEach((field) => {
      const placeholder = field.token; // e.g., "${Value16}"
      const sampleValue = field.sampleValue || ''; // Sample value from catalog
      
      replacementMap[placeholder] = sampleValue;
      replacements.push({
        placeholder,
        sampleValue,
        fieldKey: field.fieldKey,
        description: field.description,
      });
    });

    // Step 4: Replace placeholders in DOCX
    const resultPath = await replacePlaceholdersInDocx(tempFilePath, replacementMap, previewFilePath);
    
    if (!resultPath || !fs.existsSync(resultPath)) {
      throw new Error('Failed to create preview DOCX with replacements');
    }

    // Step 5: Return preview metadata
    return {
      previewFilePath: resultPath,
      placeholdersReplaced: matchResult.recognizedFields.length,
      unknownPlaceholders: matchResult.unknownFields.length,
      replacements,
      unknownFields: matchResult.unknownFields,
    };
  } catch (error) {
    logger.error('Error generating preview with sample values:', error);
    throw error;
  }
}

/**
 * Clean up preview temp files
 * 
 * @param {string} previewFilePath - Path to preview file to delete
 */
export function cleanupPreviewFile(previewFilePath) {
  try {
    if (fs.existsSync(previewFilePath)) {
      fs.unlinkSync(previewFilePath);
    }
  } catch (error) {
    logger.error('Error cleaning up preview file:', error);
    // Don't throw - cleanup is non-critical
  }
}

export default {
  generatePreviewWithSampleValues,
  cleanupPreviewFile,
};
