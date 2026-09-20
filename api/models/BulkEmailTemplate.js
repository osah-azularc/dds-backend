import { mysqlSequelize } from '../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const BulkEmailTemplate = mysqlSequelize.define(
  'BulkEmailTemplate',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'bulk_email_template_id',
    },
    emailSubject: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'email_subject',
    },
    emailBody: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'email_body',
    },
    emailStatus: {
      type: DataTypes.TINYINT,
      allowNull: true,
      field: 'email_status',
    },
    emailAttachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'email_attachment',
    },
    sentBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sent_by',
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_date',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'modified_date',
    },
    modifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'modified_by',
    },
  },
  {
    tableName: 'bulk_email_template',
    freezeTableName: true,
    timestamps: false,
  }
);

BulkEmailTemplate.sync({ alter: false });

export default BulkEmailTemplate;

