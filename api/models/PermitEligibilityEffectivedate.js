import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const PermitEligibilityEffectivedate = mysqlSequelize.define(
  "PermitEligibilityEffectivedate",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "caseid",
    },
    effectiveDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "effective_date",
    },
    eligibility: {
      type: DataTypes.TINYINT,
      allowNull: false,
      field: "eligibility",
    },
    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "expiry_date",
    },
    permitPrintDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "permit_print_date",
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
  },
  {
    tableName: "permit_eligibility_effectivedate",
    timestamps: false,
  }
);

export default PermitEligibilityEffectivedate;
