import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

/**
 * Sequelize model for document_template_versions
 *
 * Stores a point-in-time snapshot of the ACTIVE DOCX file before each file
 * replacement.  One row is written per file-replacement edit.
 * Metadata-only edits (no new file) never produce a row here.
 *
 * Columns intentionally match the DB structure recommended in the design doc.
 * template_id is a plain INT (no FK) so history survives hard deletes.
 */
const DocumentTemplateVersions = mysqlSequelize.define(
  'DocumentTemplateVersions',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    // Logical link to document_templates.id — no FK constraint (history survives deletes)
    templateId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'template_id',
    },
    // 1-based, sequential per template_id (computed inside DB transaction)
    versionNumber: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      field: 'version_number',
    },
    // Physical filename of the DOCX that was replaced (e.g. "my_template.docx")
    documentname: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Relative path within EFS: "<ENV>/data/templates_version/<id>/<ts>/<name>.docx"
    documentPath: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'document_path',
    },
    // 'UPDATE_FILE' | 'RENAME_AND_UPDATE_FILE'
    changeType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'change_type',
    },
    changedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'changed_by',
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'changed_at',
    },
  },
  {
    tableName: 'document_template_versions',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocumentTemplateVersions;
