/*
  Created by  : Snehal Narkar
  Date        : 2026-08-31
  Description : Sequelize model for invoice_template_manager (Admin Invoice Settings).
                Singleton config table — always exactly one row.
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const InvoiceTemplateManager = mysqlSequelize.define(
  'InvoiceTemplateManager',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: false,
    },
    heading: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    remitInformation: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'remit_information',
    },
    tanInformation: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'tan_information',
    },
    caseReferralFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'case_referral_fee',
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
    tableName: 'invoice_template_manager',
    timestamps: false,
    freezeTableName: true,
  },
);

export default InvoiceTemplateManager;
