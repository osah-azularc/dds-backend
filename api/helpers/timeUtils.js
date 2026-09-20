import momentTimezone from 'moment-timezone';

// PHP uses date("H:i:s") / date("Y-m-d") which reflects the PHP server's configured
// timezone (America/New_York). Node must match to keep created_time consistent.
const LOCAL_TZ = 'America/New_York';

export const localNow = () => momentTimezone().tz(LOCAL_TZ);
