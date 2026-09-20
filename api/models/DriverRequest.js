import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DriverRequest = mysqlSequelize.define(
  'DriverRequest',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    options: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'options',
    },
  },
  {
    tableName: 'driverrequest',
    timestamps: false,
    freezeTableName: true,
  },
);

export default DriverRequest;
