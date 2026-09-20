import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { logger } from "../../config/winstonLogger.js";

const NotificationCaseTypes = mysqlSequelize.define(
  "NotificationCaseTypes",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agency",
    },
    caseType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "case_type",
    },
    caseDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "case_description",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "updated_date",
    },
  },
  {
    tableName: "notification_case_types",
    timestamps: false,
    freezeTableName: true,
    indexes: [
      {
        name: "idx_agency",
        fields: ["agency"],
      },
      {
        name: "idx_case_type",
        fields: ["case_type"],
      },
    ],
  }
);

NotificationCaseTypes.sync({ alter: false })
  .then(() => {
    logger.info("NotificationCaseTypes table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing NotificationCaseTypes table:", error);
  });

export default NotificationCaseTypes;
