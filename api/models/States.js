import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const States = mysqlSequelize.define(
  "States",
  {
    idStates: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "idstates",
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "state",
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "country",
    },
    description: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "description",
    },
  },
  {
    tableName: "states",
    timestamps: false,
  },
);
States.sync({ alter: false })
  .then(() => {})
  .catch(() => {});

export default States;
