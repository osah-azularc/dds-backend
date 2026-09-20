import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const CasetypeDocuments = mysqlSequelize.define(
  "CasetypeDocuments",
  {
    documenttype: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "casetypedocuments",
    timestamps: false,
    freezeTableName: true,
  }
);

export default CasetypeDocuments;
