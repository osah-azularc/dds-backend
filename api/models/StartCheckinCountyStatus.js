import { DataTypes } from 'sequelize';
import { mysqlSequelize } from '../../connections/seqDB.js';

const StartCheckinCountyStatus = mysqlSequelize.define(
  'StartCheckinCountyStatus',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    judgeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'judge_id',
    },
    countyCircuitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'county_circuit_id',
    },
    casetypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'casetype_id',
    },
    updatedCasetypeCaseid: {
      type: DataTypes.STRING(200),
      allowNull: true,
      defaultValue: '0',
      field: 'updated_casetype_caseid',
    },
    startCheckinDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'start_checkin_date',
    },
    startCheckinFlag: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'start_checkin_flag',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      field: 'created_by',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
  },
  {
    tableName: 'start_checkin_county_status',
    timestamps: false,
    freezeTableName: true,
  }
);

export default StartCheckinCountyStatus;
