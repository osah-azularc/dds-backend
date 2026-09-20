import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const NotificationCaseTypesRestriction = mysqlSequelize.define(
  "NotificationCaseTypesRestriction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'agency',
    },
    caseType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'case_type',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_date',
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'updated_date',
    },
  },
  {
    tableName: "notification_case_types_restriction",
    timestamps: false,
    freezeTableName: true,
  }
);

export default NotificationCaseTypesRestriction;