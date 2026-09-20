import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Form1Docket = mysqlSequelize.define(
  "Form1Docket",
  {
    form1Id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "form1_id",
    },
    ecourtCaseid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "ecourt_caseid",
    },
    docketNumber: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "docketnumber",
    },
    docketClerk: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "docketclerk",
    },
    hearingReqBy: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "hearingreqby",
    },
    status: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "status",
    },
    dateRequested: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "daterequested",
    },
    dateReceivedByOSAH: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "datereceivedbyOSAH",
    },
    refAgency: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "refagency",
    },
    caseType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "casetype",
    },
    caseFileType: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "casefiletype",
    },
    county: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "county",
    },
    agencyRefNumber: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "agencyrefnumber",
    },
    agencyPlatformId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "agency_platform_id",
    },
    hearingMode: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "hearingmode",
    },
    hearingSite: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "hearingsite",
    },
    hearingDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "hearingdate",
    },
    hearingTime: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "hearingtime",
    },
    hearingTimeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "hearingtime_id",
    },
    judge: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "judge",
    },
    judgeAssistant: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "judgeassistant",
    },
    hearingRequestedDate: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "hearingrequesteddate",
    },
    others: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "others",
    },
    docketCreatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "docket_createddate",
    },
    telvOFive: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: "telv_o_five",
    },
    tempPermits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "temp_permits",
    },
    caseName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '(NULL)',
      field: "casename",
    },
    attorneyForPetitioner: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '(NULL)',
      field: "attorneyforpetitioner",
    },
    stateRepresentative: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '(NULL)',
      field: "staterepresentative",
    },
    staffAttorney: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "staffattorney",
    },
    agencyCreatedBy: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: "agency_createdby",
    },
    childForm1Id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "child_form1_id",
    },
    isResubmitted: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: "is_resubmitted",
    },
    closedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "closed_date",
    },
    isFileScanned: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: "is_file_scanned",
    },
  },
  {
    tableName: "form1_docket",
    timestamps: false,
  }
);

export default Form1Docket;

