import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import Role from "./Role.js";
import Permission from "./Permission.js";

const RolePermission = mysqlSequelize.define(
  "role_permissions",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Role,
        key: "id",
      },
    },
    permission_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Permission,
        key: "id",
      },
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "role_permissions",
    indexes: [
      {
        unique: true,
        fields: ["role_id", "permission_id"],
      },
    ],
  }
);

// Define associations
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: "role_id",
  as: "permissions",
});

Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: "permission_id",
  as: "roles",
});

RolePermission.belongsTo(Role, { foreignKey: "role_id", as: "role" });
RolePermission.belongsTo(Permission, {
  foreignKey: "permission_id",
  as: "permission",
});

// COMMENTED OUT - Individual sync causes foreign key constraint errors
// Tables should be synced in proper order through setupAssociations.js
// RolePermission.sync({ alter: false })
//   .then(() => {
//     logger.info("RolePermission table synchronized");
//   })
//   .catch((error) => {
//     logger.error("Error in synchronizing RolePermission table:", error);
//   });

export default RolePermission;
