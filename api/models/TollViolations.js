import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const TollViolations = mysqlSequelize.define(
  "TollViolations",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    noOfViolations: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "no_of_violations",
    },
    tollFees: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: "toll_fees",
    },
    statutoryFees: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: "statutory_fees",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "form1_id",
    },
    agencyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "agency_id",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    createdBy: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: "created_by",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
    modifiedBy: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: "modified_by",
    },
  },
  {
    tableName: "toll_violations",
    timestamps: false,
  }
);

export default TollViolations;
