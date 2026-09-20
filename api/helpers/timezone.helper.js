import moment from "moment-timezone";

export const convertToClientTimeZone = (date, clientTimeZone) => {
  return moment.tz(date, clientTimeZone);
};
