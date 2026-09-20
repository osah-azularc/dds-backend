import { DataTypes } from 'sequelize';
import { mysqlSequelize } from "../../connections/seqDB.js";


const AttachmentPathsModel = mysqlSequelize.define(
  'AttachmentPaths',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'documentid',
    },
    attachmentPath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'attachmentpath',
    },
  },
  {
    tableName: 'attachmentpaths',
    timestamps: false, // Disable Sequelize's automatic timestamps
    underscored: true, // Use snake_case column names
  }
);

export default AttachmentPathsModel;