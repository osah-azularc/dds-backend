import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import { logger } from "../../config/winstonLogger.js";

const Permission = mysqlSequelize.define(
  "permissions",
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
    resource: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "permissions",
  }
);

Permission.sync({ alter: false })
  .then(() => {
    logger.info("Permission table synchronized");
  })
  .catch((error) => {
    logger.error("Error in synchronizing Permission table:", error);
  });

export default Permission;
