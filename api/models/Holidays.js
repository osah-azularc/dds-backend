import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const Holidays = mysqlSequelize.define(
  "Holidays",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: "id",
    },
    type: {
      type: DataTypes.ENUM('day', 'date'),
      allowNull: false,
      field: "type",
    },
    week: {
      type: DataTypes.TINYINT,
      allowNull: false,
      comment: 'if type is day then -1=last week',
      field: "week",
    },
    dateDay: {
      type: DataTypes.TINYINT,
      allowNull: false,
      comment: 'if type is day then 0=mon, 1=tue, 2=wed, 3=thur, 4=fri, 5=sat and 6=sun',
      field: "date_day",
    },
    month: {
      type: DataTypes.TINYINT,
      allowNull: false,
      field: "month",
    },
    createdDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_date",
    },
    modifiedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "modified_date",
    },
  },
  {
    tableName: "holidays",
    timestamps: false, // We're using custom created_date and modified_date fields
    freezeTableName: true, // Use exact table name as specified
  }
);

export default Holidays;

