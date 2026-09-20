import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const PublicAccessUser = mysqlSequelize.define(
  "PublicAccessUser",
  {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "user_id",
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "firstname",
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "lastname",
    },
    email: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "email",
    },
    password: {
      type: DataTypes.STRING(250),
      allowNull: true,
      field: "password",
    },
    barNo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "barno",
    },
    userType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "user_type",
    },
    optOutEmail: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
      field: "opt_out_email",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "createddate",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "modifieddate",
    },
    accessToken: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: "access_token",
    },
    eServices: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "e_services",
    },
    userUuid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "user_uuid",
    },
    loginAttempts: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "login_attempts",
    },
    accountLockedTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "account_locked_time",
    },
    isAccountLocked: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "is_account_locked",
    },
  },
  {
    tableName: "publicaccess_users",
    timestamps: false,
  }
);

export default PublicAccessUser;