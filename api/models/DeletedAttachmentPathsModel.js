import { DataTypes } from 'sequelize';
import { mysqlSequelize } from "../../connections/seqDB.js";

const DeletedAttachmentPathsModel = mysqlSequelize.define(
  'DeletedAttachmentPaths',
  {
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'documentid',
      primaryKey: true,
    },
    deletedAttachmentPathsCol: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      field: 'deletedattachmentpathscol',
    },
  },
  {
    tableName: 'deletedattachmentpaths',
    timestamps: false, // Disable Sequelize's automatic timestamps
    underscored: true, // Use snake_case column names
  }
);

export default DeletedAttachmentPathsModel;
