import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

const DocketNotifications = mysqlSequelize.define(
  "docket_notifications",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      field: "id",
    },

    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "caseid",
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },

    usersFollowing: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      field: "users_following",
    },

    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },

    updatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_date",
    },
  },
  {
    tableName: "docket_notifications",
    timestamps: false,
    freezeTableName: true,
  }
);

export default DocketNotifications;
