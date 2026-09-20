import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../config/winstonLogger.js";

const Role = mysqlSequelize.define(
  "roles",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "roles",
  }
);

Role.sync({ alter: false })
  .then(() => {
    logger.info("Role table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing Role table:", error);
  });

export default Role;
