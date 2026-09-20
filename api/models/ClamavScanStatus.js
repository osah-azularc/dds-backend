import { DataTypes } from "sequelize";
import { mysqlSequelize } from "../../connections/seqDB.js";

/**
 * Maps clamav_scan_status — written by the external Ruby/ClamAV S3 worker
 * (osah.repos/clamAv), read here to complete the post-scan processing that
 * legacy PHP's EfilingController::filescanStatusAction() used to perform.
 * Columns proven by worker.rb's INSERT statement and OSAHFilescanModel.php's
 * SELECT/UPDATE usage; no columns invented beyond what those prove exist.
 */
const ClamavScanStatus = mysqlSequelize.define(
  "ClamavScanStatus",
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
      allowNull: true,
      field: "caseid",
    },
    docId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "docid",
    },
    scanStatus: {
      type: DataTypes.ENUM("1", "2"),
      allowNull: true,
      field: "scan_status",
      comment: "1 => clean, 2 => infected",
    },
    fileAddedFrom: {
      type: DataTypes.ENUM("1", "2", "3"),
      allowNull: true,
      field: "file_added_from",
      comment: "1 => ecourt, 2 => agency, 3 => eportal",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
    updateAction: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      field: "update_action",
      comment: "0 => pending processing, 1 => processed",
    },
  },
  {
    tableName: "clamav_scan_status",
    timestamps: false,
    freezeTableName: true,
  }
);

export default ClamavScanStatus;
