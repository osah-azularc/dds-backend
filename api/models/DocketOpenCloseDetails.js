import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const DocketOpenCloseDetails = mysqlSequelize.define(
  "DocketOpenCloseDetails",
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
    docketStatus: {
      type: DataTypes.ENUM('open', 'closed', 'sys_generated', 'sys_closed', 're_opened'),
      allowNull: false,
      defaultValue: 'open',
      field: "docket_status",
      comment: '1 => created, 0=> Closed',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
  },
  {
    tableName: "docket_open_close_details",
    timestamps: false,
  }
);

export default DocketOpenCloseDetails;

