import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
// COMMENTED OUT - Root level PostgreSQL models deleted
// import User from "./userModel.js"; // DELETED - PostgreSQL model
// import Role from "./roleModel.js"; // DELETED - PostgreSQL model
import User from "./User.js"; // MySQL User model - KEEP THIS

const UserRoleMapping = mysqlSequelize.define(
  "user_role_mapping",
  {
    agency_id: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    agency_platform_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_by: {
      type: DataTypes.SMALLINT,
      allowNull: true,
    },
    created_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    mapping_id: {
      type: DataTypes.SMALLINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    modified_by: {
      type: DataTypes.SMALLINT,
      allowNull: true,
    },
    modified_date: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    user_id: {
      type: DataTypes.SMALLINT,
      allowNull: true,
    },
    user_role_type: {
      type: DataTypes.ENUM("agency", "public"),
      allowNull: true,
      defaultValue: "public",
      charset: "latin1",
      collate: "latin1_swedish_ci",
    },
  },
  {
    mysqlSequelize,
    modelName: "UserRoleMapping",
    tableName: "user_role_mapping",
    timestamps: false,
    charset: "latin1",
    collate: "latin1_swedish_ci",
  }
);

UserRoleMapping.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

UserRoleMapping.sync({ alter: false })
  .then(() => {
    // UserRoleMapping table synchronized
  })
  .catch((error) => {
    // Error in synchronizing UserRoleMapping table
  });

export default UserRoleMapping;
