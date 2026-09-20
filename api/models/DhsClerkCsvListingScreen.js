import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const DhsClerkCsvListingScreen = mysqlSequelize.define(
  'DhsClerkCsvListingScreen',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    fileName: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'filename',
    },
    status: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '0',
      field: 'status',
      comment: '0 = Pending, 1 = Reviewed',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
    updatedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_date',
    },
  },
  {
    tableName: 'dhs_clerk_csv_listing_screen',
    timestamps: false,
    freezeTableName: true,
  }
);

export default DhsClerkCsvListingScreen;
