/*
  Created by  : Snehal Narkar
  Date        : 2026-08-21
  Description : Sequelize model for time_entry_expense_types (Admin Expense Types).
                category_names is mapped for schema completeness but unused by the admin
                CRUD helper — legacy's own Category field/column is HTML-commented out of
                both the list and the add/edit form (expense-types.phtml), so it's dead
                weight there too. Only task_billable = '1' AND task_billable_active = '1'
                rows are eligible for billable-activity/invoicing queries (same gating as
                TimeEntryTask, despite the confusingly task-named columns on an
                expense-type table).
*/
import { mysqlSequelize } from "../../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const TimeEntryExpenseType = mysqlSequelize.define(
  "TimeEntryExpenseType",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    expenseType: { type: DataTypes.TEXT, allowNull: true, field: "expense_types_names" },
    category: { type: DataTypes.TEXT, allowNull: true, field: "category_names" },
    description: { type: DataTypes.TEXT, allowNull: true, field: "task_description" },
    isBillable: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      field: "task_billable",
    },
    isActive: {
      type: DataTypes.ENUM("0", "1"),
      allowNull: true,
      defaultValue: "1",
      field: "task_billable_active",
    },
    createdDate: { type: DataTypes.DATE, allowNull: true, field: "created_date" },
    updatedDate: { type: DataTypes.DATE, allowNull: true, field: "updated_date" },
  },
  {
    tableName: "time_entry_expense_types",
    timestamps: false,
    freezeTableName: true,
  },
);

export default TimeEntryExpenseType;
