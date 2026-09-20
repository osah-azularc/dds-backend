import V2_5_Calendar from '../admin/v2_5_calendarModel.js';
import V2_5_Circuit from '../admin/v2_5_circuitModel.js';
import CasteTypeGroups from '../admin/casteTypeGroupsModel.js';
import V2_5_Calendar_Hearing_Info from '../admin/v2_5_calendar_hearing_infoModel.js';
import V2_5_CalendarCasetype from '../admin/v2_5_calendarCasetypeModel.js';
import JudgeAssistantClerk from '../JudgeAssistantClerk.js';
import CourtLocations from '../CourtLocations.js';
import HearingTime from '../calendar/HearingTimeModel.js';
import caseTypes from '../admin/caseTypesModel.js';
import CalendarHistory from '../admin/calendarHistoryModel.js';

// V2_5_Calendar → V2_5_Circuit (many-to-one via circuit_id)
V2_5_Calendar.belongsTo(V2_5_Circuit, { foreignKey: 'circuitId', as: 'circuit' });

// V2_5_Calendar → CasteTypeGroups (many-to-one via casetype_group_id)
V2_5_Calendar.belongsTo(CasteTypeGroups, {
  foreignKey: 'caseTypeGroupId',
  as: 'casetypeGroupInfo',
});

// V2_5_Calendar → V2_5_Calendar_Hearing_Info (one-to-many via calendar_id)
V2_5_Calendar.hasMany(V2_5_Calendar_Hearing_Info, {
  foreignKey: 'calendarId',
  as: 'hearingInfos',
});
V2_5_Calendar_Hearing_Info.belongsTo(V2_5_Calendar, { foreignKey: 'calendarId', as: 'calendar' });

// V2_5_Calendar_Hearing_Info → JudgeAssistantClerk (judge_id / cma_id both reference the same table)
V2_5_Calendar_Hearing_Info.belongsTo(JudgeAssistantClerk, { foreignKey: 'judgeId', as: 'judge' });
V2_5_Calendar_Hearing_Info.belongsTo(JudgeAssistantClerk, { foreignKey: 'cmaId', as: 'cma' });

// V2_5_Calendar_Hearing_Info → CourtLocations (court_location_id)
V2_5_Calendar_Hearing_Info.belongsTo(CourtLocations, {
  foreignKey: 'courtLocationId',
  as: 'courtLocation',
});

// V2_5_Calendar_Hearing_Info → HearingTime (time_id)
V2_5_Calendar_Hearing_Info.belongsTo(HearingTime, { foreignKey: 'timeId', as: 'hearingTime' });

// V2_5_Calendar → V2_5_CalendarCasetype (one-to-many via calendar_id)
V2_5_Calendar.hasMany(V2_5_CalendarCasetype, {
  foreignKey: 'calendarId',
  as: 'calendarCasetypes',
});
V2_5_CalendarCasetype.belongsTo(V2_5_Calendar, { foreignKey: 'calendarId', as: 'calendar' });

// V2_5_CalendarCasetype → caseTypes (many-to-one via casetype_id)
V2_5_CalendarCasetype.belongsTo(caseTypes, {
  foreignKey: 'caseTypeId',
  targetKey: 'Casetypeid',
  as: 'casetype',
});

// CalendarHistory → V2_5_Calendar (many-to-one via CalendarId). The linked
// calendar can be null since history rows survive calendar deletion.
CalendarHistory.belongsTo(V2_5_Calendar, { foreignKey: 'CalendarId', as: 'calendar' });
