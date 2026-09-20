import DocumentsTable from '../../models/DocumentsTable.js';
import AttachmentPathsModel from '../../models/AttachmentPathsModel.js';
import History from '../../models/History.js';
import Docket from '../../models/Docket.js';
import { localNow } from '../timeUtils.js';
import { getMatchedCasetypeMappings, getMappingAutomations } from '../../services/documentTemplateMappingService.js';

const normalizeId = (value) => (value === undefined || value === null || value === '' ? null : String(value));

export async function getDocumentById(documentId, caseId) {
  return DocumentsTable.findOne({
    where: {
      documentId,
      caseId,
    },
  });
}

export async function updateDocumentById(documentId, fileInfo) {
  const nextFields = {};

  if (fileInfo.description !== undefined) {
    nextFields.description = fileInfo.description;
  }

  if (fileInfo.isSealed !== undefined) {
    nextFields.isSealed = fileInfo.isSealed;
  }

  const [rowsAffected] = await DocumentsTable.update(nextFields, {
    where: { documentId },
  });

  return rowsAffected;
}

export async function addDocumentHistory(caseId, message, modifiedBy) {
  const now = localNow();
  return History.create({
    caseId,
    docketCaseId: caseId,
    description: message,
    modifiedBy,
    date: now.format('YYYY-MM-DD'),
    createdTime: now.format('HH:mm:ss'),
  });
}

export async function getQuickActionsTemplates(caseId) {
  const docket = await Docket.findOne({
    where: { caseId },
    attributes: ['refAgency', 'caseType'],
  });

  if (!docket) {
    return null;
  }

  const mappings = await getMatchedCasetypeMappings([docket.refAgency], [docket.caseType]);
  if (!mappings.length) return { decision: [], continuance: [], noh: [] };

  const mappingIds = mappings.map((m) => m.id);
  const automations = await getMappingAutomations(mappingIds);

  return automations.reduce((acc, automation) => {
    const templateData = {
      documentId: normalizeId(automation.templateId),
      automationSubType: automation.automationSubType,
      automationType: automation.automationType,
    };

    if (automation.automationType === 'decision') acc.decision.push(templateData);
    if (automation.automationType === 'continuance') acc.continuance.push(templateData);
    if (automation.automationType === 'noh') acc.noh.push(templateData);

    return acc;
  }, { decision: [], continuance: [], noh: [] });
}

export async function getDocumentAttachmentPath(documentId) {
  const resolvedDocumentId = Number.parseInt(String(documentId), 10);
  if (Number.isNaN(resolvedDocumentId)) {
    return null;
  }

  const attachment = await AttachmentPathsModel.findOne({
    where: { documentId: resolvedDocumentId },
  });

  return attachment ? attachment.attachmentPath : null;
}