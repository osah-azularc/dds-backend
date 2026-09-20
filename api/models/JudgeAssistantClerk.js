import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";
import Role from "./Role.js";

const JudgeAssistantClerk = mysqlSequelize.define(
  "JudgeAssistantClerk",
  {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "user_id",
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "FirstName",
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "LastName",
    },
    middleInitial: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "MiddleInitial",
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "title",
    },
    initials: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "initials",
    },
    phone: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "phone",
    },
    fax: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "Fax",
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "email",
    },
    userType: {
      type: DataTypes.ENUM(
        "clerk",
        "cma",
        "judge",
        "it",
        "sa",
        "finance",
        "dds_clerk",
        "dds_helpdesk",
        "dds_superuser"
      ),
      allowNull: true,
      field: "user_type",
    },
    subTypeRole: {
      type: DataTypes.ENUM("judge", "sa", "saalj", "law_clerk"),
      allowNull: true,
      field: "sub_type_role",
    },
    isActive: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: false,
      defaultValue: "1",
      field: "is_active",
    },
    isAdmin: {
      type: DataTypes.ENUM("1", "0", "2"),
      allowNull: false,
      defaultValue: "0",
      field: "is_admin",
    },
    reviewForm1s: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "review_form1s",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "created_by",
    },
    modifiedBy: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "modified_by",
    },
    accessToken: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: "access_token",
    },
    notificationOnOff: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "1",
      comment: "1 is on notification, 0 is off notification",
      field: "notification_on_off",
    },
    userUuid: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "",
      field: "user_uuid",
    },
    isActiveBilling: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_active_billing",
    },
    isAdministrativePersonnel: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "is_administrative_personnel",
    },
    judgeAssistantClerkConcat: {
      type: DataTypes.VIRTUAL,
      get() {
        return `${this.lastName} ${this.firstName}`;
      },
      field: "judge_assistant_clerk_concat",
    },
  },
  {
    tableName: "judge_assistant_clerk",
    timestamps: false,
  }
);

// Association using user_type -> roles.name
JudgeAssistantClerk.belongsTo(Role, {
  foreignKey: "userType",
  targetKey: "name",
  as: "roleDetails",
});

export default JudgeAssistantClerk;
