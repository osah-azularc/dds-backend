import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const PublicAccessMappingTable = mysqlSequelize.define(
  'PublicAccessMappingTable',
  {
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'caseid',
    },
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: true,
      field: 'userid',
    },
  },
  {
    tableName: 'publicaccess_mappingtable',
    timestamps: false,
  }
);

export default PublicAccessMappingTable;
