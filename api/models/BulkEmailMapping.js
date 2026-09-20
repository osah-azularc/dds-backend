import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const BulkEmailMapping = mysqlSequelize.define(
  'BulkEmailMapping',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id',
    },
    bulkEmailId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bulk_email_id',
    },
    caseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'caseid',
    },
    emailStatus: {
      type: DataTypes.TINYINT,
      allowNull: true,
      field: 'email_status',
    },
    partyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'party_id',
    },
    tableName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'table_name',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
    advanceFilters: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'advance_filters',
    },
    isDeleted: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: false,
      defaultValue: '0',
      field: 'is_deleted',
    },
  },
  {
    tableName: 'bulk_email_mapping',
    freezeTableName: true,
    timestamps: false,
  }
);

BulkEmailMapping.sync({ alter: false });

export default BulkEmailMapping;

