/**
 * Template Field Matcher Service
 * 
 * Purpose:
 * Match extracted DOCX placeholders against the document_template_fields_catalog
 * to identify recognized vs unknown fields.
 * 
 * Placeholder Format:
 * - Detected: ${FieldName} (e.g., ${Value16}, ${noofviolations})
 * - Catalog: display_name column stores the same format
 * - Matching: Exact string match between detected placeholder and display_name
 * 
 * @author AI Assistant
 * @date March 16, 2026
 */

import DocumentTemplateFieldsCatalog from '../models/DocumentTemplateFieldsCatalog.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Match detected placeholders against the field catalog
 * 
 * @param {string[]} detectedTokens - Array of placeholders extracted from DOCX (e.g., ["${Value16}", "${Minors}"])
 * @param {string} templateFamily - Template family to filter by (default: 'legacy_core')
 * @returns {Promise<Object>} - Object containing fieldsDetected, recognizedFields, unknownFields
 * 
 * Return shape:
 * {
 *   fieldsDetected: ["${Value16}", "${Value12}", "${Minors}"],
 *   recognizedFields: [
 *     {
 *       token: "${Value16}",
 *       fieldKey: "hearing_date",
 *       displayName: "${Value16}",
 *       description: "Hearing Date",
 *       category: "Case Details",
 *       sampleValue: "March 15, 2026",
 *       notes: "Date of scheduled hearing"
 *     }
 *   ],
 *   unknownFields: ["${Value999}"]
 * }
 */
export async function matchTokensAgainstCatalog(
  detectedTokens,
  templateFamily = 'legacy_core'
) {
  try {
    // Fetch active catalog entries for the template family
    const catalogEntries = await DocumentTemplateFieldsCatalog.findAll({
      where: {
        templateFamily,
        isActive: true,
      },
      order: [['sortOrder', 'ASC']],
      raw: true,
    });

    // Create a map for quick lookup: displayName -> catalog entry
    const catalogMap = new Map();
    catalogEntries.forEach((entry) => {
      // Use display_name as the matching key (converted to camelCase by Sequelize)
      if (entry.displayName) {
        catalogMap.set(entry.displayName, entry);
      }
    });

    // Match tokens
    const recognizedFields = [];
    const unknownFields = [];

    detectedTokens.forEach((token) => {
      const catalogEntry = catalogMap.get(token);
      
      if (catalogEntry) {
        // Token matches a catalog entry
        recognizedFields.push({
          token: token,
          fieldKey: catalogEntry.fieldKey,
          displayName: catalogEntry.displayName,
          description: catalogEntry.description,
          category: catalogEntry.category,
          sampleValue: catalogEntry.sampleValue,
          notes: catalogEntry.notes,
        });
      } else {
        // Token not found in catalog
        unknownFields.push(token);
      }
    });

    return {
      fieldsDetected: detectedTokens,
      recognizedFields,
      unknownFields,
    };
  } catch (error) {
    logger.error(`Error matching tokens against catalog: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch all active catalog entries for a template family and return a plain
 * object mapping fieldKey → bare token string (displayName with '${' and '}'
 * stripped).
 *
 * e.g. { hearing_date: 'Value16', petitioner_name: 'Values1', ... }
 *
 * Use this in document-generation services to look up the correct placeholder
 * name without duplicating the fieldKey→token mapping across multiple files.
 *
 * @param {string} templateFamily - Template family (default: 'legacy_core')
 * @returns {Promise<Record<string, string>>} fieldKey → bare token map
 */
export async function getFieldTokenMap(templateFamily = 'legacy_core') {
  try {
    const entries = await DocumentTemplateFieldsCatalog.findAll({
      where: { templateFamily, isActive: true },
      attributes: ['fieldKey', 'displayName'],
      raw: true,
    });

    const map = {};
    entries.forEach(({ fieldKey, displayName }) => {
      if (displayName?.startsWith('${') && displayName.endsWith('}')) {
        map[fieldKey] = displayName.slice(2, -1);
      }
    });
    return map;
  } catch (error) {
    logger.error(`Error fetching field token map: ${error.message}`);
    return {};
  }
}

export default {
  matchTokensAgainstCatalog,
  getFieldTokenMap,
};
