import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const DocketDisposition = mysqlSequelize.define(
  'DocketDisposition',
  {
      caseId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        field: 'caseid',
      },
      dispositionCode: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'dispositioncode',
      },
      dispositionDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'dispositiondate',
      },
      signedByJudge: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'signedbyjudge',
      },
      mailedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'mailedddate',
      },
      hearingYesNo: {
        type: DataTypes.STRING(5),
        allowNull: true,
        field: 'hearingyesno',
      },
      closingClerk: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'closingclerk',
      },
      boxNo: {
        type: DataTypes.STRING(25),
        allowNull: true,
        field: 'boxno',
      },
      docketDispositionDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'docketdispositiondate',
      },
    },
    {
      tableName: 'docketdisposition',
      timestamps: false,
      freezeTableName: true,
    }
);

export default DocketDisposition;