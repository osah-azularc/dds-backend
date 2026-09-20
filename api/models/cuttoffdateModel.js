import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';


const Cuttoffdate = mysqlSequelize.define(
  'cuttoffdate',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    casetypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'casetypeid',
    },
    numberOfDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'numberofdays',
    },
    cutoffDaysDifference: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'cutoff_days_diffrence',
    },
    casetypeGroupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'casetype_groupid',
    },
    isActive: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '1',
      field: 'isactive',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_date',
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'modified_date',
    },
  },
  {
    tableName: 'cuttoffdate',
    timestamps: false,
    freezeTableName: true,
  }
);

export default Cuttoffdate;


