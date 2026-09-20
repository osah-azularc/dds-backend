/*
  Created by  : Snehal Narkar
  Date        : 2026-08-10
  Description : Sequelize model for time_entry_billable_agency (Admin Billable Agencies).
*/
import { mysqlSequelize } from '../../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const BillableAgency = mysqlSequelize.define(
  'BillableAgency',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    agencyDescription: { type: DataTypes.TEXT, allowNull: true, field: 'agency_description' },
    agencyCode: { type: DataTypes.STRING(50), allowNull: true, field: 'agency_code' },
    parentAgency: { type: DataTypes.STRING(50), allowNull: true, field: 'parent_agency' },
    firstName: { type: DataTypes.STRING(100), allowNull: true, field: 'first_name' },
    lastName: { type: DataTypes.STRING(100), allowNull: true, field: 'last_name' },
    middleName: { type: DataTypes.STRING(100), allowNull: true, field: 'middle_name' },
    email: { type: DataTypes.STRING(100), allowNull: true },
    addressLineOne: { type: DataTypes.TEXT, allowNull: true, field: 'address_line_one' },
    addressLineTwo: { type: DataTypes.TEXT, allowNull: true, field: 'address_line_two' },
    city: { type: DataTypes.TEXT, allowNull: true },
    state: { type: DataTypes.TEXT, allowNull: true },
    zipcode: { type: DataTypes.TEXT, allowNull: true },
    isActive: {
      type: DataTypes.ENUM('0', '1'),
      allowNull: true,
      defaultValue: '1',
      field: 'time_entry_billable_agency_active',
    },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: 'created_date' },
    updatedDate: { type: DataTypes.DATE, allowNull: true, field: 'updated_date' },

    // First billing contact (legacy "billing_validation" section)
    firstNameTwo: { type: DataTypes.STRING(100), allowNull: true, field: 'first_name_two' },
    lastNameTwo: { type: DataTypes.STRING(100), allowNull: true, field: 'last_name_two' },
    middleNameTwo: { type: DataTypes.STRING(100), allowNull: true, field: 'middle_name_two' },
    emailTwo: { type: DataTypes.STRING(100), allowNull: true, field: 'email_two' },
    addressLineBillingOne: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address_line_billing_one',
    },
    addressLineBillingTwo: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address_line_billing_two',
    },
    cityTwo: { type: DataTypes.TEXT, allowNull: true, field: 'city_two' },
    stateTwo: { type: DataTypes.TEXT, allowNull: true, field: 'state_two' },
    zipcodeTwo: { type: DataTypes.TEXT, allowNull: true, field: 'zipcode_two' },

    // Second billing contact (legacy "billing_validation2" section)
    firstNameThree: { type: DataTypes.STRING(100), allowNull: true, field: 'first_name_three' },
    lastNameThree: { type: DataTypes.STRING(100), allowNull: true, field: 'last_name_three' },
    emailThree: { type: DataTypes.STRING(100), allowNull: true, field: 'email_three' },
    addressLineBillingThree: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address_line_billing_three',
    },
    addressLineBillingFour: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address_line_billing_four',
    },
    cityThree: { type: DataTypes.TEXT, allowNull: true, field: 'city_three' },
    stateThree: { type: DataTypes.TEXT, allowNull: true, field: 'state_three' },
    zipcodeThree: { type: DataTypes.TEXT, allowNull: true, field: 'zipcode_three' },
  },
  {
    tableName: 'time_entry_billable_agency',
    timestamps: false,
    freezeTableName: true,
  },
);

export default BillableAgency;
