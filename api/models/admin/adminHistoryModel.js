import { mysqlSequelize } from "../../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const AdminHistory = mysqlSequelize.define("admin_history", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  new_values: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  modified_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  module_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  action_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  modified_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: false, // Disable automatic timestamps since we use custom fields
});

AdminHistory.sync({ alter: false });

export default AdminHistory;
