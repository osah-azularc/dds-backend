import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const User = mysqlSequelize.define(
  "User",
  {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "user_id",
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "firstname",
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "lastname",
    },
    middleName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "middlename",
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "phone",
    },
    fax: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "fax",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "email",
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "password",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "status",
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_login",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "modified_by",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "modified_date",
    },
    passwordExpiration: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "password_expiration",
    },
    userUuid: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "user_uuid",
    },
    loginAttempts: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "login_attempts",
    },
    accountLockedTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "account_locked_time",
    },
    isAccountLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: "is_account_locked",
    },
  },
  {
    tableName: "user_master",
    timestamps: false,
  }
);

export default User;
