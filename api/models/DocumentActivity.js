import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const DocumentActivity = mysqlSequelize.define(
  "document_activity",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    activity_desc: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    caseid: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    document_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(25),
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    modified_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    modified_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "document_activity",
    timestamps: false, // Disable automatic `createdAt` and `updatedAt` fields
    indexes: [
      {
        name: "idx_user_id",
        fields: ["user_id"],
      },
      {
        name: "idx_caseid",
        fields: ["caseid"],
      },
    ],
  }
);

export default DocumentActivity;