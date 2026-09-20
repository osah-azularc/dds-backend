
import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const DocumentsTable = mysqlSequelize.define(
  'DocumentsTable',
  {
    documentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'documentid', // Map to the database column
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'Caseid',
    },
    documentType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'DocumentType',
    },
    granted: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'Granted',
    },
    dateRequested: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'DateRequested',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'Description',
    },
    attachmentFilePaths: {
      type: DataTypes.STRING(2000),
      allowNull: true,
      field: 'Attachmentfilepaths',
    },
    documentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'DocumentName',
    },
    noOfAttachments: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'noofattachments',
    },
    docketCaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'Docket_caseid',
    },
    docFileFlage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'doc_file_flage',
    },
    rocFlag: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'roc_flag',
    },
    casetypeDocId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'casetype_doc_id',
    },
    isScanned: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '1',
      field: 'is_scanned',
      comment: '1 => File scanned, 0 => File not scanned',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'modified_by',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'modified_date',
    },
    isSealed: {
      type: DataTypes.ENUM('1', '0'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_sealed',
    },
    documentNameInAwsBucket: {
      type: DataTypes.STRING(250),
      allowNull: true,
      field: 'document_name_in_aws_bucket',
      comment: 'Name of the document present on S3 bucket in AWS server',
    },
    isAltStorage: {
      type: DataTypes.ENUM('1', '0'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_alt_storage',
    },
  },
  {
    tableName: 'documentstable', // Explicitly map to the correct table name
    timestamps: false, // Disable automatic timestamps
  }
);

export default DocumentsTable;
