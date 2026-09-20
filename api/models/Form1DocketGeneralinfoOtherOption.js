import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1DocketGeneralinfoOtherOption = mysqlSequelize.define(
  "Form1DocketGeneralinfoOtherOption",
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
    benefitsContinued: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "0",
      field: "benefitscontinued",
    },
    heringRequestAgency: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: "heringrequestagency",
    },
    dateAppealReceivedOsah: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "date_appeal_received_osah",
    },
    benefitesContinuedAns: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "benefites_continued_ans",
    },
    adverseActionIssueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "adverse_action_issue_date",
    },
    agencyAction: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "agency_action",
      comment: "0 => Default, 1 => Initial, 2 => Adverse action to current benefits",
    },
    expeditedAppeal: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "expedited_appeal",
    },
  },
  {
    tableName: "form1_docket_generalinfo_other_option",
    timestamps: false,
  }
);

export default Form1DocketGeneralinfoOtherOption;
