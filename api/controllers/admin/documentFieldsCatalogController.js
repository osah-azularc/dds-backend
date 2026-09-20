import DocumentTemplateFieldsCatalog from "../../models/DocumentTemplateFieldsCatalog.js";
import { logger } from "../../../config/winstonLogger.js";
import { extractTokensFromDocx, getTempFilePath } from "../../utilities/docxTokenExtractor.js";
import { matchTokensAgainstCatalog } from "../../services/templateFieldMatcher.js";
import fs from 'fs';

/**
 * Get Dynamic Fields Catalog
 * Fetches active dynamic fields for template_family='legacy_core'
 * Used by DocumentsFieldCatalog.jsx
 */
export const getDynamicFieldsCatalog = async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize, 10) || 25), 100);

    const { count: totalCount, rows: results } = await DocumentTemplateFieldsCatalog.findAndCountAll({
      where: {
        templateFamily: 'legacy_core',
        isActive: true,
      },
      attributes: [
        'fieldKey',
        'displayName',
        'description',
        'category',
        'sampleValue',
        'notes',
      ],
      order: [
        ['sortOrder', 'ASC'],
        ['displayName', 'ASC'],
      ],
      limit: pageSize,
      offset: page * pageSize,
      raw: true,
    });

    // Map camelCase back to snake_case for frontend compatibility
    const mappedResults = results.map((row) => ({
      field_key: row.fieldKey,
      display_name: row.displayName,
      description: row.description,
      category: row.category,
      sample_value: row.sampleValue,
      notes: row.notes,
    }));

    return res.status(200).json({
      success: true,
      data: mappedResults,
      pagination: { page, pageSize, totalCount },
      message: 'Dynamic fields catalog retrieved successfully.',
    });
  } catch (error) {
    logger.error('Error fetching dynamic fields catalog', { message: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dynamic fields catalog.',
      error: error.message,
    });
  }
};

/**
 * Update Dynamic Field Catalog
 * Updates sample_value and notes for a specific field_key
 * Used by DocumentsFieldCatalog.jsx
 */
export const updateDynamicFieldCatalog = async (req, res) => {
  try {
    const { fieldKey, sampleValue, notes } = req.body;

    // Validate required field
    if (!fieldKey) {
      return res.status(400).json({
        success: false,
        message: 'fieldKey is required.',
      });
    }

    // Find the record
    const field = await DocumentTemplateFieldsCatalog.findOne({
      where: {
        fieldKey: fieldKey,
        templateFamily: 'legacy_core',
        isActive: true,
      },
    });

    if (!field) {
      return res.status(404).json({
        success: false,
        message: 'Dynamic field not found.',
      });
    }

    // Update the record
    await field.update({
      sampleValue: sampleValue || '',
      notes: notes || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Dynamic field updated successfully.',
      data: {
        field_key: field.fieldKey,
        sample_value: field.sampleValue,
        notes: field.notes,
      },
    });
  } catch (error) {
    logger.error('Error updating dynamic field catalog', { message: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to update dynamic field.',
      error: error.message,
    });
  }
};

/**
 * Scan Template Fields
 * Extracts placeholders from a temp DOCX file and matches them against the field catalog
 * Read-only operation - no database modifications
 * 
 * Placeholder Format: ${FieldName}
 * Examples: ${Value16}, ${noofviolations}, ${totaldueamount}
 * 
 * Scanning Scope:
 * - word/document.xml (main body)
 * - word/header*.xml (headers)
 * - word/footer*.xml (footers)
 * 
 * @route GET /admin/scanTemplateFields/:tempId
 * @param {string} tempId - UUID of the temp uploaded DOCX file
 * @returns {Object} - Analysis with fieldsDetected, recognizedFields, unknownFields
 * 
 * Response Example:
 * {
 *   success: true,
 *   data: {
 *     tempId: "uuid",
 *     fieldsDetected: ["${Value16}", "${noofviolations}", "${UnknownField}"],
 *     recognizedFields: [
 *       {
 *         token: "${Value16}",
 *         fieldKey: "hearing_date",
 *         displayName: "${Value16}",
 *         description: "Hearing Date",
 *         category: "Case Details",
 *         sampleValue: "March 15, 2026",
 *         notes: ""
 *       }
 *     ],
 *     unknownFields: ["${UnknownField}"],
 *     totalDetected: 3,
 *     totalRecognized: 2,
 *     totalUnknown: 1
 *   }
 * }
 */
export const scanTemplateFields = async (req, res) => {
  try {
    const { tempId } = req.params;

    // Validate tempId
    if (!tempId) {
      return res.status(400).json({
        success: false,
        message: 'tempId is required.',
      });
    }

    // Get temp file path
    const tempFilePath = getTempFilePath(tempId);

    // Verify temp file exists
    if (!fs.existsSync(tempFilePath)) {
      return res.status(404).json({
        success: false,
        message: 'Temp file not found. Please upload the document again.',
      });
    }

    // Extract tokens from DOCX
    const detectedTokens = await extractTokensFromDocx(tempFilePath);

    // Match tokens against catalog
    const matchResult = await matchTokensAgainstCatalog(detectedTokens);

    return res.status(200).json({
      success: true,
      data: {
        tempId,
        fieldsDetected: matchResult.fieldsDetected,
        recognizedFields: matchResult.recognizedFields,
        unknownFields: matchResult.unknownFields,
        totalDetected: matchResult.fieldsDetected.length,
        totalRecognized: matchResult.recognizedFields.length,
        totalUnknown: matchResult.unknownFields.length,
      },
      message: 'Template field scan completed successfully.',
    });
  } catch (error) {
    logger.error('Error scanning template fields', { message: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to scan template fields.',
      error: error.message,
    });
  }
};
