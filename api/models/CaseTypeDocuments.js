import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const CaseTypeDocuments = mysqlSequelize.define(
  'CaseTypeDocuments',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    caseType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'casetype',
    },
    documentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'documentname',
    },
    agency: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'agency',
    },
    documentType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'documenttype',
    },
    documentOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'document_order',
    },
    docOrderDecNondec: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
      field: "doc_order_dec_nondec",
      comment: "Document order for decision and non decision dropdown",
    },
    allCasetypeAgency: {
      type: DataTypes.ENUM("0", "1", "2", "3"),
      allowNull: false,
      defaultValue: "0",
      field: "all_casetype_agency",
      comment: "1 is for All Document, 2 is for Newly Added and 3 is for Common in general doc and decision/non-decision",
    },
    allDocReorder: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'all_doc_reorder',
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
    active: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      field: "active",
      comment: "1 is Active 0 is Inactive",
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'displayname',
    },
    isSpanishdoc: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'is_spanishdoc',
    },
  },
  {
    tableName: 'casetypedocuments',
    timestamps: false,
    freezeTableName: true,
  }
);

export default CaseTypeDocuments;
