/** Own settings (from the environment): the LINE Official Account's Messaging API channel. Secrets never go to the browser or the logs. */
export const lineConfig = {
  accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
  channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
  /** public link used in messages, e.g. http://172.48.0.116:5175 */
  appUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  tzOffsetMinutes: Number(process.env.APP_TZ_OFFSET_MINUTES) || 420,
  intervalSec: Math.max(30, Number(process.env.LINE_ALERT_INTERVAL_SEC) || 60),
  /** only rows whose start time is newer than this are watched (old forgotten rows would flood the group) */
  windowDays: Math.max(1, Number(process.env.LINE_ALERT_WINDOW_DAYS) || 7),
};
export const lineEnabled = () => !!lineConfig.accessToken;
