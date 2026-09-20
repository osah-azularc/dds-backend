import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const EfilingHistory = mysqlSequelize.define(
  "EfilingHistory",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "description",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "created_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_date",
    },
    modifiedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_at",
    },
  },
  {
    tableName: "efiling_history",
    timestamps: false,
    indexes: [
      {
        name: "idx_created_by",
        fields: ["created_by"],
      },
    ],
  }
);

export default EfilingHistory;


