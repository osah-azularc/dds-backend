// Barrel re-export - the actual calendar service logic lives in ./services/,
// split by domain (common lookup data, calendar CRUD, county-casetype
// validation, list, history, hearing info read/write, duplicate-date checks)
// to keep each module a manageable size. Kept here so
// adminCalendarController.js's `import * as calendarService from
// "./calendarService.js"` doesn't need to change.
export { CalendarServiceError } from "./services/calendarServiceError.js";
export { getCalendarCommonData } from "./services/calendarCommonDataService.js";
export {
  addUpdateCalendarInfo,
  deleteCalendarInfo,
  getCalendarDetailsById,
} from "./services/calendarCrudService.js";
export { validateCountyCasetypeCombination } from "./services/calendarValidationService.js";
export { getCalendarList } from "./services/calendarListService.js";
export { getCalendarHistoryList } from "./services/calendarHistoryService.js";
export { getHearingInfo } from "./services/hearingInfoService.js";
export {
  saveHearingInfo,
  deleteHearingInfo,
} from "./services/hearingInfoWriteService.js";
export {
  checkDuplicateHearingDate,
  getDuplicateHearingDateReport,
} from "./services/duplicateHearingDateService.js";
