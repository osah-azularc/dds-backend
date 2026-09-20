import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const CaseTypeStyling = mysqlSequelize.define(
  "casetypestyling",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "AgencyID",
    },
    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "Casetypeid",
    },
    petitioner: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "petitioner",
    },
    respondent: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "respondent",
    },
    fileType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Filetype",
    },
  },
  {
    timestamps: false,
    freezeTableName: true,
  }
);

CaseTypeStyling.sync({ alter: false })
  .then(() => {
    logger.info("CaseTypeStyling table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing CaseTypeStyling table:", error);
  });

export default CaseTypeStyling;
