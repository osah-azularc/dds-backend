import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AllegedChildAbuser = mysqlSequelize.define(
  "AllegedChildAbuser",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    partyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "party_id",
    },
    classificationOfChildAbuse: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "classification_of_child_abuse",
    },
    ageOfAllegedChildAbuser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "age_of_alleged_child_abuser",
    },
    numberOfChildren: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "number_of_children",
    },
  },
  {
    tableName: "form1_party_alleged_child_abuser",
    timestamps: false,
  }
);

export default AllegedChildAbuser;
