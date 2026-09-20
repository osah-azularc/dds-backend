import { mysqlSequelize } from '../../../connections/seqDB.js';
import { DataTypes } from 'sequelize';

const V2_5_CalendarCasetype = mysqlSequelize.define(
  'v2_5_calendar_casetype',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    calendarId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'calendar_id',
    },
    caseTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'casetype_id',
    },
  },
  {
    timestamps: false,
    freezeTableName: true,
  }
);

export default V2_5_CalendarCasetype;

