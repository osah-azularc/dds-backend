/**
 * Template Version Service
 *
 * Handles DB-side version history for document templates.
 * Both functions must be called inside an active Sequelize transaction so that
 * version rows are atomically rolled back if the parent template update fails.
 *
 * Only file-replacement edits produce version rows.
 * Metadata-only edits must NOT call these functions.
 */

import DocumentTemplateVersions from '../../models/admin/documentTemplateVersionsModel.js';

/**
 * Compute the next version_number for a given template.
 * Uses MAX(version_number) + 1 scoped to the template_id so the sequence is
 * per-template, not global.  Returns 1 for the first version of a template.
 *
 * Must be called inside the DB transaction to avoid a race on concurrent edits.
 *
 * @param {number} templateId
 * @param {object} transaction - Active Sequelize transaction
 * @returns {Promise<number>} Next version number (>= 1)
 */
export const computeNextVersionNumber = async (templateId, transaction) => {
  const maxVer = await DocumentTemplateVersions.max('versionNumber', {
    where: { templateId },
    transaction,
  });
  return (Number(maxVer) || 0) + 1;
};

/**
 * Insert one row into document_template_versions.
 * Captures the state of the file BEFORE it was replaced by this edit.
 *
 * @param {object} params
 * @param {number} params.templateId       - FK to document_templates.id (no constraint)
 * @param {number} params.versionNumber    - From computeNextVersionNumber
 * @param {string} params.documentName     - Old filename (the file being replaced)
 * @param {string} params.documentPath     - Relative EFS path to the version snapshot
 * @param {string} params.changeType       - 'UPDATE_FILE' | 'RENAME_AND_UPDATE_FILE'
 * @param {number|null} params.changedBy   - User ID who triggered the edit
 * @param {object} params.transaction      - Active Sequelize transaction
 * @returns {Promise<void>}
 */
export const insertTemplateVersionRow = async ({
  templateId,
  versionNumber,
  documentName,
  documentPath,
  changeType,
  changedBy,
  transaction,
}) => {
  await DocumentTemplateVersions.create(
    {
      templateId,
      versionNumber,
      documentname: documentName,
      documentPath,
      changeType,
      changedBy,
      changedAt: new Date(),
    },
    { transaction }
  );
};
