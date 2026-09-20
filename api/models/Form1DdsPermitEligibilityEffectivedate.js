import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1DdsPermitEligibilityEffectivedate = mysqlSequelize.define(
  "Form1DdsPermitEligibilityEffectivedate",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    form1Id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "form1_id",
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
    tableName: "form1_dds_permit_eligibility_effectivedate",
    timestamps: false,
  }
);

export default Form1DdsPermitEligibilityEffectivedate;
