// No scheduled jobs yet. Register cron.schedule(...) tasks here as DDS needs them,
// and return a stop function that stops whatever you scheduled.
export const crons = () => {
  const tasks = [];

  return () => tasks.forEach((task) => task.stop());
};
