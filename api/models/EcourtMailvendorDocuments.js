import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const EcourtMailvendorDocuments = mysqlSequelize.define(
  "EcourtMailvendorDocuments",
  {
    documentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "documentid",
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "caseid",
    },
    documentType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "document_type",
    },
    documentName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "document_name",
    },
    documentFilePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: "document_file_path",
    },
    isMoved: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "0",
      field: "is_moved",
    },
    isEmailed: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "0",
      field: "is_emailed",
    },
    noOfPages: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "no_of_pages",
    },
    cmaId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "cmaid",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "created_by",
    },
    createdDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "created_date",
    },
  },
  {
    tableName: "ecourt_mailvendor_documents",
    timestamps: false,
  }
);

export default EcourtMailvendorDocuments;
