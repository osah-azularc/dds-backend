import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../../config/winstonLogger.js";

const partyType = mysqlSequelize.define(
  "party_types",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "id",
    },
    party_type_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "party_type_name",
    },
    party_type_table: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "party_type_table",
    },
    is_autocomplete: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "0",
      allowNull: false,
      field: "is_autocomplete",
    },
    is_attorney: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "0",
      allowNull: false,
      field: "is_attorney",
    },
    is_active: {
      type: DataTypes.ENUM("1", "0"),
      defaultValue: "1",
      allowNull: false,
      field: "is_active",
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    created_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "updated_by",
    },
    updated_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "updated_date",
    },
  },
  {
    tableName: "party_types",
    timestamps: false,
    freezeTableName: true,
  },
);

partyType
  .sync({ alter: false })
  .then(() => {
    logger.info("party type table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing party type table:", error);
  });

export default partyType;
