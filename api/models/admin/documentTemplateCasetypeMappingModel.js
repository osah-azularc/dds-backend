import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DocumentTemplateCasetypeMapping = mysqlSequelize.define(
  'DocumentTemplateCasetypeMapping',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    templateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'template_id' },
    agency: { type: DataTypes.STRING, allowNull: true },
    casetype: { type: DataTypes.STRING, allowNull: true },
    documentOrder: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0, field: 'document_order' },
    docOrderDecNondec: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0, field: 'doc_order_dec_nondec' },
    scopePart: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_part' },
    isAllCasetypes: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, field: 'is_all_casetypes' },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    modifiedDate: { type: DataTypes.DATE, allowNull: true, field: 'modified_date' },
  },
  {
    tableName: 'document_template_casetype_mapping',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocumentTemplateCasetypeMapping;
