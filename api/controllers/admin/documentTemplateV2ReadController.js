import { mysqlSequelize } from "../../../connections/seqDB.js";
import { Op } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";
import DocumentTemplates from "../../models/admin/documentTemplatesModel.js";
import DocumentTemplateCasetypeMapping from "../../models/admin/documentTemplateCasetypeMappingModel.js";
import DocumentTemplateMappingAutomation from "../../models/admin/documentTemplateMappingAutomationModel.js";
import {
  groupMappingRows,
  buildScopeTypeFlags,
  normalizeDateFormat,
  buildCasetypeConflictWhere,
} from "./helpers/templateMappingTransformer.js";
import { buildFilterWhereClause } from "./helpers/templateReadHelpers.js";

/**
 * Get single V2 document template by ID for Edit page.
 * Returns template with all mappings and automation data.
 *
 * @route POST /admin/getTemplateByIdV2
 */
export const getTemplateByIdV2 = async (req, res) => {
  try {
    const { templateId } = req.body;
    const templateIdNum = Number(templateId);

    if (!templateIdNum || templateIdNum <= 0) {
      return res.status(400).json({
        status: 400,
        title: "Validation error",
        message: "Valid template ID is required.",
        success: false,
      });
    }

    const template = await DocumentTemplates.findByPk(templateIdNum, {
      attributes: ['id', 'displayname', 'documentname', 'documenttype', 'active', 'scopeType', 'isSpanishdoc'],
      raw: true,
    });

    if (!template) {
      return res.status(404).json({
        status: 404,
        title: "Template not found",
        message: `Template with ID ${templateIdNum} does not exist.`,
        success: false,
      });
    }

    const mappingRows = await DocumentTemplateCasetypeMapping.findAll({
      where: { templateId: templateIdNum },
      attributes: ['id', 'agency', 'casetype'],
      include: [{
        model: DocumentTemplateMappingAutomation,
        as: 'automation',
        required: false,
        attributes: ['automationType', 'automationSubType'],
      }],
      order: [['id', 'ASC']],
      raw: true,
      nest: true,
    });

    const mappingsArray = groupMappingRows(mappingRows);
    const scopeType = buildScopeTypeFlags(template.scopeType);
    const dateFormat = normalizeDateFormat(template.isSpanishdoc);
    const statusNormalized = String(template.active) === '0' ? '0' : '1';

    return res.status(200).json({
      status: 200,
      message: "Template fetched successfully",
      data: {
        id: template.id,
        displayName: template.displayname,
        fileName: template.documentname,
        documentType: template.documenttype,
        status: statusNormalized,
        dateFormat,
        scopeType,
        mappings: mappingsArray,
      },
      success: true,
    });
  } catch (error) {
    logger.error("[getTemplateByIdV2] Error", { message: error.message });
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch template",
      message: "Template could not be fetched at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Get all V2 document templates for Single Edit grid.
 * Returns paginated list with grouped case types per agency.
 *
 * @route POST /admin/getAllTemplatesV2
 */
export const getAllTemplatesV2 = async (req, res) => {
  try {
    const {
      agencies = [],
      caseTypes = [],
      scopeType,
      documentName,
      status = '1',
      automationTypes = [],
      page = 0,
      pageSize = 25,
    } = req.body;

    const { whereSQL, replacements } = buildFilterWhereClause({
      agencies, caseTypes, scopeType, documentName, status, automationTypes,
    });

    /*
     * Raw SQL is intentionally used for the COUNT + paginated list queries below.
     * Justification: the SELECT column list contains a nested correlated subquery with
     * two levels of GROUP_CONCAT (agency-grouped casetype display string). This cannot
     * be expressed with Sequelize model attributes without embedding a multi-line
     * Sequelize.literal() string — which would be harder to read and maintain than the
     * parameterised raw query already here. All user-supplied values are bound via named
     * replacements (:param), so SQL-injection risk is fully mitigated.
     */
    const [countRows] = await mysqlSequelize.query(
      `SELECT COUNT(*) as total FROM document_templates dt ${whereSQL}`,
      { replacements, raw: true }
    );
    const total = Number(countRows[0]?.total ?? 0);

    replacements.pageSize = pageSize;
    replacements.offset = page * pageSize;

    const [templates] = await mysqlSequelize.query(
      `SELECT
        dt.id,
        dt.displayname as displayName,
        dt.documentname as fileName,
        COALESCE(
          (
            SELECT GROUP_CONCAT(
              CONCAT(agency_group, ': ', casetypes)
              ORDER BY agency_group
              SEPARATOR ' | '
            )
            FROM (
              SELECT
                m.agency as agency_group,
                GROUP_CONCAT(
                  CASE WHEN m.casetype = 'all' THEN 'All' ELSE m.casetype END
                  ORDER BY m.casetype
                  SEPARATOR ', '
                ) as casetypes
              FROM document_template_casetype_mapping m
              WHERE m.template_id = dt.id
              GROUP BY m.agency
            ) agency_cases
          ),
          'N/A'
        ) as caseType,
        dt.documenttype as documentType,
        dt.active as status
      FROM document_templates dt
      ${whereSQL}
      ORDER BY dt.id DESC
      LIMIT :pageSize OFFSET :offset`,
      { replacements, raw: true }
    );

    return res.status(200).json({
      status: 200,
      message: "V2 templates fetched successfully",
      data: templates,
      total,
      success: true,
    });
  } catch (error) {
    logger.error("[getAllTemplatesV2] Error", { message: error.message });
    return res.status(500).json({
      status: 500,
      title: "Unable to fetch templates",
      message: "Templates could not be fetched at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Check if an agency + casetype + automation combination already exists in another template.
 * Mappings without automation are allowed to duplicate across templates.
 *
 * @route POST /admin/checkDuplicateAutomationMappingV2
 */
export const checkDuplicateAutomationMappingV2 = async (req, res) => {
  try {
    const { templateId, agency, casetype, automation_type, automation_sub_type } = req.body;

    if (!agency || !casetype) {
      return res.status(400).json({
        status: 400,
        message: "Agency and casetype are required",
        success: false,
      });
    }

    // No automation provided — non-automation mappings can duplicate
    if (!automation_type && !automation_sub_type) {
      return res.status(200).json({
        status: 200,
        data: { isDuplicate: false },
        success: true,
      });
    }

    if (automation_type && !automation_sub_type) {
      return res.status(400).json({
        status: 400,
        message: "Automation sub-type is required when automation type is selected",
        success: false,
      });
    }

    const templateIdNum = templateId ? Number(templateId) : null;
    const casetypeWhere = buildCasetypeConflictWhere(casetype);

    const conflict = await DocumentTemplates.findOne({
      subQuery: false,
      where: {
        active: '1',
        ...(templateIdNum ? { id: { [Op.ne]: templateIdNum } } : {}),
      },
      attributes: ['id', 'displayname', 'documentname'],
      include: [{
        model: DocumentTemplateCasetypeMapping,
        as: 'mappings',
        required: true,
        attributes: [],
        where: { agency, ...casetypeWhere },
        include: [{
          model: DocumentTemplateMappingAutomation,
          as: 'automation',
          required: true,
          attributes: [],
          where: {
            automationType: automation_type,
            automationSubType: automation_sub_type,
          },
        }],
      }],
    });

    if (conflict) {
      return res.status(200).json({
        status: 200,
        data: {
          isDuplicate: true,
          conflictingTemplate: {
            id: conflict.id,
            displayName: conflict.displayname,
            documentName: conflict.documentname,
          },
        },
        success: true,
      });
    }

    return res.status(200).json({
      status: 200,
      data: { isDuplicate: false },
      success: true,
    });
  } catch (error) {
    logger.error("[checkDuplicateAutomationMappingV2] Error", { message: error.message });
    return res.status(500).json({
      status: 500,
      message: "Unable to check for duplicate mapping at this time. Please try again.",
      success: false,
    });
  }
};



