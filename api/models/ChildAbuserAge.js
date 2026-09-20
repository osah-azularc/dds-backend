import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const ChildAbuserAge = mysqlSequelize.define(
  "ChildAbuserAge",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    allegedChildAbuserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "alleged_child_abuser_id",
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "age",
    },
  },
  {
    tableName: "form1_party_ages_of_children_alleged_abused",
    timestamps: false,
  }
);

export default ChildAbuserAge;
