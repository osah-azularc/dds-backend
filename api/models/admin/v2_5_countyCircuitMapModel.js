import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const V2_5_CountyCircuitMap = mysqlSequelize.define(
  'v2_5_county_circuit_map',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    countyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'county_id',
    },
    circuitId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'circuit_id',
    },
  },
  {
    timestamps: false,
    freezeTableName: true,
  }
);

export default V2_5_CountyCircuitMap;

