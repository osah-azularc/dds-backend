import documentTypes from "../../models/case/documentTypeModel.js";
import { Op } from "sequelize";
import DocumentTypesForAutomation from "../../models/DocumentTypesForAutomation.js";
import CasetypeDocuments from "../../models/case/casetypeDocumentsModel.js";
import { logger } from "../../../config/winstonLogger.js";

export const getTemplateTypes = async (req, res) => {
  try {
    const result = await documentTypes.findAll({
      attributes: ["id", "documenttype"],
      order: [["documenttype", "ASC"]],
    });
    return res.status(200).json({
      status: 200,
      message: "Template types data fetched successfully",
      data: result,
      success: true,
    });
  } catch (error) {
    logger.error("Error fetching template types:", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch template types data",
      message:
        "Template types data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Get distinct document template types for Document Template V2
 * Sources from casetypedocuments table (template registry)
 * Author: AI Assistant
 * Date: Feb 23, 2026
 */
export const getDocumentTemplateTypesV2 = async (req, res) => {
  try {
    const result = await CasetypeDocuments.findAll({
      attributes: ["documenttype"],
      where: {
        documenttype: {
          [Op.not]: null,
          [Op.ne]: "",
        },
      },
      group: ["documenttype"],
      order: [["documenttype", "ASC"]],
      raw: true,
    });
    return res.status(200).json({
      status: 200,
      message: "Document template types fetched successfully",
      data: result,
      success: true,
    });
  } catch (error) {
    logger.error("Error fetching document template types:", error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch document template types",
      message:
        "Document template types are unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

/**
 * Get automation types for document templates
 * Returns decision, continuance, and NOH types grouped by automation_type
 * Matches legacy PHP endpoint: admin/getDocumentTypesForAutomation
 */
export const getDocumentTypesForAutomation = async (req, res) => {
  try {
    const allTypes = await DocumentTypesForAutomation.findAll({
      order: [['type', 'ASC']],
    });

    // Group by automation_type: 1=Decision, 2=Continuance, 3=NOH
    const decisionType = [];
    const continuanceType = [];
    const nohType = [];

    allTypes.forEach((item) => {
      const data = { id: item.id, type: item.type, automation_type: item.automationType };
      if (item.automationType === '1') {
        decisionType.push(data);
      } else if (item.automationType === '2') {
        continuanceType.push(data);
      } else {
        nohType.push(data);
      }
    });

    return res.json({
      status: 200,
      message: 'Automation types fetched successfully',
      data: { decisionType, continuanceType, nohType },
      success: true,
    });
  } catch (error) {
    logger.error('getDocumentTypesForAutomation error:', error);
    return res.json({
      status: 500,
      title: 'Unable to fetch automation types',
      message: 'An error occurred while fetching automation types.',
      success: false,
    });
  }
};
